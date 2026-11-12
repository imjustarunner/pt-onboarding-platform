import { SECURE_MESSAGE_BUTTON_URL } from '../../../frontend/src/navigation/secureMessageBrand.js';
import { escapePortalHtml as escape } from './portalEmailBranding.service.js';

export function secureMessageActionHtml(value) {
  let url;
  try {
    url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
  } catch { return ''; }
  const href = escape(url.href);
  return `<p style="margin:24px 0"><a data-secure-message-action="read" href="${href}" style="display:block;text-decoration:none"><img src="${SECURE_MESSAGE_BUTTON_URL}" alt="Read secure message" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:0"></a></p><p style="font-size:12px;line-height:1.5;overflow-wrap:anywhere;color:#627187">Or copy and paste this link into your browser:<br><a href="${href}" style="color:#16457c">${href}</a></p>`;
}
