import { PDFDocument } from 'pdf-lib';
import { fail, has, requirePhi } from './policy.js';
import { normalizeSessionPhone } from './integrationPolicy.js';

export const MAX_FAX_BYTES = 5 * 1024 * 1024;
export function requireFaxSupport(ctx) {
  requirePhi(ctx);
  if (!has(ctx, 'admin') && !has(ctx, 'schedule')) throw fail(403, 'Support or practice administration access is required for faxes.');
}
export function faxRoute(settings, practiceId, sending = false) {
  const route = settings.clientMessaging?.routes?.find(r => r.practiceId === practiceId);
  if (!route?.mainNumber || !route.faxVerifiedAt || !settings.notifyre?.apiToken || !settings.notifyre?.baaReference || !settings.notifyre?.webhookSecret)
    throw fail(409, 'The platform superadmin must verify this agency’s primary fax number and Notifyre connection first.');
  if (sending && !route.faxEnabled) throw fail(409, 'Fax sending is turned off for this agency.');
  return route;
}
export function notifyreFaxNumbers(payload) {
  const rows = payload?.Numbers ?? payload?.numbers;
  if (!Array.isArray(rows)) throw fail(503, 'Notifyre returned an unrecognized fax number list.');
  return rows.filter(n => String(n.Status ?? n.status).toLowerCase() === 'active')
    .map(n => normalizeSessionPhone(n.E164 ?? n.e164)).filter(Boolean);
}
export async function faxPdf(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_FAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw fail(400, 'Choose a PDF no larger than 5 MB.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > MAX_FAX_BYTES || bytes.subarray(0, 5).toString() !== '%PDF-')
    throw fail(400, 'Choose a valid PDF no larger than 5 MB.');
  let doc;
  try { doc = await PDFDocument.load(bytes); } catch { throw fail(400, 'This PDF cannot be read. Export an unencrypted PDF and try again.'); }
  const pages = doc.getPageCount();
  if (!pages || pages > 100) throw fail(400, 'Choose a PDF with 1–100 pages.');
  return { base64: value, pages };
}
export function normalizeFaxEvent(input) {
  const type = input?.Event ?? input?.event;
  const p = input?.Payload ?? input?.payload;
  if (!['fax_received', 'fax_sent'].includes(type) || !p) throw fail(400, 'Unsupported fax event.');
  const id = String(p.ID ?? p.id ?? '');
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw fail(400, 'Invalid fax identifier.');
  const received = type === 'fax_received';
  const to = normalizeSessionPhone(String(p.To ?? p.to ?? ''));
  const from = normalizeSessionPhone(String(received ? (p.From ?? p.from ?? '') : (p.FromNumber ?? p.fromNumber ?? '')));
  if (!to || (!received && !from)) throw fail(400, 'Missing fax routing number.');
  const statuses = { accepted: 'submitted', successful: 'delivered', failed: 'failed', in_progress: 'sending', queued: 'submitted' };
  const status = received ? 'received' : statuses[String(p.Status ?? p.status).toLowerCase()];
  if (!status) throw fail(400, 'Unsupported fax delivery status.');
  const stamp = Number(input.Timestamp ?? input.timestamp);
  if (!Number.isFinite(stamp) || stamp <= 0) throw fail(400, 'Missing fax event timestamp.');
  return { carrierId: id, direction: received ? 'received' : 'sent', from, to, status, timestamp: stamp,
    reference: String(p.Reference ?? p.reference ?? ''), pages: Math.max(0, Math.min(10000, Number(p.Page ?? p.Pages ?? p.page ?? p.pages) || 0)) };
}
export function faxStatusUpdate(current, event) {
  // Delivery callbacks can be repeated or arrive out of order. Never undo a terminal receipt.
  if (['delivered', 'failed'].includes(current.status) || Number(current.eventAt || 0) > event.timestamp) return current;
  return { ...current, status: event.status, eventAt: event.timestamp, pages: event.pages || current.pages };
}
