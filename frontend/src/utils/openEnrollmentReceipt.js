import api from '../services/api';

function writeLoading(popup) {
  if (!popup || popup.closed) return;
  try {
    popup.document.open();
    popup.document.write('<!doctype html><title>Loading document…</title><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155"><p>Loading document…</p></body>');
    popup.document.close();
  } catch { /* cross-origin or closed */ }
}

function closeQuietly(popup) {
  try { if (popup && !popup.closed) popup.close(); } catch { /* ignore */ }
}

async function blobText(blob) {
  if (typeof blob?.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * The view endpoint streams encrypted files but answers `{ url }` (a short-lived
 * signed storage URL) for plain stored PDFs. Resolve either shape to a URL the
 * tab can display.
 */
export async function resolveEnrollmentReceiptUrl(data, contentType = '') {
  const type = String(contentType || data?.type || '').toLowerCase();
  if (data && !(data instanceof Blob) && typeof data === 'object' && data.url) return String(data.url);
  if (data instanceof Blob) {
    if (type.includes('json')) {
      const parsed = JSON.parse(await blobText(data));
      if (parsed?.url) return String(parsed.url);
      throw new Error(parsed?.error?.message || 'The enrollment receipt file is not available.');
    }
    const pdf = type ? data : new Blob([data], { type: 'application/pdf' });
    return URL.createObjectURL(pdf);
  }
  return URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
}

function navigate(popup, url) {
  if (popup && !popup.closed) {
    try {
      try { popup.opener = null; } catch { /* ignore */ }
      popup.location.href = url;
      return true;
    } catch { /* fall through */ }
  }
  const opened = window.open(url, '_blank');
  if (opened) {
    try { opened.opener = null; } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Open a signed enrollment receipt in a new tab. The tab is opened before the
 * request so pop-up blockers treat it as part of the click.
 * Resolves { ok, error, fallbackUrl }.
 */
export async function openEnrollmentReceipt(docId) {
  return openOperationalDocument(`/phi-documents/enrollment-receipts/${encodeURIComponent(docId)}/view`);
}

/** A scoped, authorized document endpoint; supports PDFs and signed-URL JSON. */
export async function openOperationalDocument(endpoint) {
  const popup = window.open('about:blank', '_blank');
  writeLoading(popup);
  let url = '';
  try {
    const resp = await api.get(endpoint, {
      responseType: 'blob',
      skipGlobalLoading: true
    });
    url = await resolveEnrollmentReceiptUrl(resp.data, resp.headers?.['content-type']);
  } catch (e) {
    closeQuietly(popup);
    let message = e.response?.data?.error?.message || '';
    if (!message && e.response?.data instanceof Blob) {
      try { message = JSON.parse(await blobText(e.response.data))?.error?.message || ''; } catch { /* not JSON */ }
    }
    return { ok: false, error: message || (e.response ? '' : e.message) || 'Could not open the enrollment receipt.' };
  }
  if (navigate(popup, url)) return { ok: true, url };
  closeQuietly(popup);
  return { ok: false, fallbackUrl: url, error: 'Your browser blocked a new tab. Use the link below, or allow pop-ups for this site.' };
}
