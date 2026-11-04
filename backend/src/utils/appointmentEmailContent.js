import { escapePortalHtml as e } from '../services/portalEmailBranding.service.js';

// Keep the confirmation prominent through the shared automated-email formatter.
export function appointmentActionsHtml(links) {
  return links.map(({label, url}, index) => {
    const primary = index === 0;
    return `<p style="margin:${primary ? '24px 0 14px' : '10px 0'}"><a data-appointment-action="${primary ? 'primary' : 'secondary'}" href="${e(url)}" style="display:block;text-align:center;text-decoration:none;border:1px solid ${primary ? '#16457c' : '#cbd6e3'};border-radius:8px;background:${primary ? '#16457c' : '#ffffff'};color:${primary ? '#ffffff' : '#40536b'};padding:${primary ? '18px 24px' : '9px 14px'};font-size:${primary ? '18px' : '13px'};font-weight:${primary ? '700' : '400'}">${e(label)}</a></p>`;
  }).join('');
}
