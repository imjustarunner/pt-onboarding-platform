export async function openPrivateAttachment(load, fallbackName = 'attachment', { isCurrent = () => true, timeoutMs = 30000 } = {}) {
  if (!isCurrent()) return { cancelled: true };
  // Reserve the tab during the click. Show a neutral status instead of a blank
  // window while the authenticated read is pending; never put private text here.
  const tab = window.open('', '_blank');
  if (tab) {
    tab.opener = null;
    try { tab.document?.write('<!doctype html><title>Opening document</title><p role="status">Opening your secure document…</p>'); } catch { /* browser may restrict the reserved tab */ }
  }
  const controller = new AbortController();
  let timer, previewUrl = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        reject(Object.assign(new Error('The document is taking too long to open. Your file is saved. Try opening it again after checking your connection or unlocking your session.'), { code: 'DOCUMENT_OPEN_TIMEOUT' }));
        controller.abort();
      }, timeoutMs);
    });
    const response = await Promise.race([load({ signal: controller.signal }), timeout]);
    if (!isCurrent()) { tab?.close(); return { cancelled: true }; }
    const mime = String(response.headers?.['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const disposition = String(response.headers?.['content-disposition'] || '');
    const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || fallbackName;
    if (mime === 'application/json') {
      const raw = response.data instanceof Blob ? await response.data.text() : response.data;
      let body; try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { /* visible generic error below */ }
      throw new Error(body?.error?.message || 'The document could not be opened. Refresh this conversation and try again.');
    }
    const blob = new Blob([response.data], { type: mime });
    const url = URL.createObjectURL(blob);
    previewUrl = url;
    if (['application/pdf', 'image/png', 'image/jpeg'].includes(mime) && !/^attachment/i.test(disposition)) {
      if (!tab || tab.closed) {
        URL.revokeObjectURL(url); previewUrl = null;
        throw new Error('Allow pop-ups for this site, then choose the document again to open its private preview.');
      }
      tab.location.replace(url);
    } else {
      tab?.close();
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link);
      link.click(); link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { opened: true };
  } catch (error) {
    tab?.close();
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    if(error?.response?.data?.error?.message)error.message=error.response.data.error.message;
    if (error?.response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await error.response.data.text());
        if (body?.error?.message) error.message = body.error.message;
      } catch { /* retain the request error */ }
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
