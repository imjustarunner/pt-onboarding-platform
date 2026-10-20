import { emailActionButton } from './emailActionButton.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// Render only the message body. The shared outbound pipeline supplies the
// agency's configured header, department signature, and footer.
export function renderProviderUpdateReceipt({ text }) {
  const paragraphs = String(text || '').trim().split(/\r?\n\s*\r?\n/)
    .map(paragraph => {
      const claimLink = paragraph.match(/^View your time claims:\s*(https:\/\/\S+)$/);
      const content = claimLink
        ? emailActionButton('View your time claims', claimLink[1], true)
        : escapeHtml(paragraph).replace(/\r?\n/g, '<br>');
      return `<p style="margin:0 0 16px;">${content}</p>`;
    })
    .join('');
  return `<div data-pt-provider-update-receipt="1" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;overflow-wrap:anywhere;color:#172b26;">
${paragraphs}
</div>`;
}
