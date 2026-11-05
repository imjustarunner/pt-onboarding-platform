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

/**
 * Open a signed enrollment receipt in a new tab. The tab is opened before the
 * request so pop-up blockers treat it as part of the click.
 * Resolves { ok, error, fallbackUrl }.
 */
export async function openEnrollmentReceipt(docId) {
  const popup = window.open('about:blank', '_blank');
  writeLoading(popup);
  try {
    const resp = await api.get(`/phi-documents/enrollment-receipts/${encodeURIComponent(docId)}/view`, {
      responseType: 'blob',
      skipGlobalLoading: true
    });
    const file = resp.data instanceof Blob ? resp.data : new Blob([resp.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    if (popup && !popup.closed) {
      try { popup.opener = null; } catch { /* ignore */ }
      popup.location.href = url;
      return { ok: true };
    }
    const opened = window.open(url, '_blank');
    if (opened) return { ok: true };
    return { ok: false, fallbackUrl: url, error: 'Your browser blocked a new tab. Use the link below, or allow pop-ups for this site.' };
  } catch (e) {
    closeQuietly(popup);
    return { ok: false, error: e.response?.data?.error?.message || 'Could not open the enrollment receipt.' };
  }
}
