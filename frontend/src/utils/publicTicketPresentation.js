export const websiteTicket = ticket => ticket?.source_channel === 'public_web' || /^public_/.test(ticket?.created_by_source_key || '');
export function publicTicketOriginalInquiry(ticket, messages = []) {
  const text = String(ticket?.question || '').trim();
  if (!text || messages.some(m => !m.is_internal && String(m.body || '').trim() === text)) return '';
  return text;
}
export function ticketAgencyLogo(ticket) {
  if (/^(https?:\/\/|\/(?!\/))/.test(ticket?.website_logo_url || '')) return ticket.website_logo_url;
  const path = String(ticket?.agency_logo_path || '').replace(/^\/?uploads\//, '').replace(/^\//, '');
  if (path) return `/uploads/${path}`;
  const url = String(ticket?.agency_logo_url || '');
  return /^(https?:\/\/|\/(?!\/))/.test(url) ? url : '';
}
export function ticketAgencyColor(ticket) {
  let palette = ticket?.agency_color_palette || {};
  if (typeof palette === 'string') { try { palette = JSON.parse(palette); } catch { palette = {}; } }
  const color = ticket?.website_color || palette.primary || palette.primaryColor;
  if (/^#[0-9a-f]{6}$/i.test(color || '')) return color;
  const colors = ['#175c4f','#086b8b','#854252','#675091','#996223','#385d91'];
  return colors[(Number(ticket?.agency_id) || 0) % colors.length];
}
