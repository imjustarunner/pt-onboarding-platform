function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// Transactional receipts do not need a personal photo, social icons, or banners.
// Keep the receipt readable even when a mail client blocks or caches images.
export function renderProviderUpdateReceipt({ text, identity }) {
  const label = escapeHtml(identity?.display_name || 'People Operations');
  const paragraphs = String(text || '').trim().split(/\r?\n\s*\r?\n/)
    .map(paragraph => {
      const claimLink = paragraph.match(/^View your time claims:\s*(https:\/\/\S+)$/);
      const content = claimLink
        ? `<a href="${escapeHtml(claimLink[1])}" style="color:#166534;text-decoration:underline;">View your time claims</a>`
        : escapeHtml(paragraph).replace(/\r?\n/g, '<br>');
      return `<p style="margin:0 0 16px;">${content}</p>`;
    })
    .join('');
  return `<div data-pt-provider-update-receipt="1" style="width:100%;max-width:600px;box-sizing:border-box;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;overflow-wrap:anywhere;color:#172b26;background:#ffffff;">
<div style="padding-bottom:14px;margin-bottom:20px;border-bottom:2px solid #2e9a43;font-size:18px;font-weight:700;">${label}</div>
${paragraphs}
</div>`;
}
