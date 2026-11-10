export async function openPrivateAttachment(load, fallbackName = 'attachment') {
  // Reserve the tab during the click, before the authenticated request awaits.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const response = await load();
    const mime = String(response.headers?.['content-type'] || 'application/octet-stream').split(';')[0];
    const disposition = String(response.headers?.['content-disposition'] || '');
    const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || fallbackName;
    const blob = new Blob([response.data], { type: mime });
    const url = URL.createObjectURL(blob);
    if (tab && ['application/pdf', 'image/png', 'image/jpeg'].includes(mime) && !/^attachment/i.test(disposition)) {
      tab.location.replace(url);
    } else {
      tab?.close();
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link);
      link.click(); link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    tab?.close();
    if (error?.response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await error.response.data.text());
        if (body?.error?.message) error.message = body.error.message;
      } catch { /* retain the request error */ }
    }
    throw error;
  }
}
