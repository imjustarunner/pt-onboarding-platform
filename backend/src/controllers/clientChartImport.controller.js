import { requireClientChartImportAccess } from '../services/clientChartImportAccess.service.js';
import { chartSections, readChartRecord, saveChartRecord, importSupplementaryChartSection } from '../services/clientChartImport.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

function sectionOf(req) {
  const section = req.params.section;
  if (!chartSections.includes(section)) throw Object.assign(new Error('Unknown chart section'), { status: 400 });
  return section;
}
function textOf(req) {
  const text = req.body?.text;
  if (typeof text !== 'string' || text.length > 200000) throw Object.assign(new Error('Chart text must be at most 200,000 characters'), { status: 400 });
  return text;
}
const scopeOf = req => requireClientChartImportAccess(req.user, req.params.id, req.get?.('X-Agency-Id') || req.query?.agencyId || null);

export async function getChartImportDrafts(req, res, next) {
  try {
    const scope = await scopeOf(req);
    const entries = await Promise.all(chartSections.map(async key => [key, await readChartRecord(scope, key, Number(req.user.id))]));
    await logAuditEvent(req, { actionType: 'client_chart_import_drafts_viewed', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId });
    res.set('Cache-Control', 'no-store').json({ drafts: Object.fromEntries(entries) });
  } catch (error) { next(error); }
}

export async function saveChartImportDraft(req, res, next) {
  try {
    const scope = await scopeOf(req), section = sectionOf(req), text = textOf(req);
    const revision = req.body?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) throw Object.assign(new Error('Draft revision is required'), { status: 400 });
    const metadata = req.body?.metadata || {};
    const value = { text, ...(typeof metadata.sourceDate === 'string' ? { sourceDate: metadata.sourceDate.slice(0, 10) } : {}),
      ...(typeof metadata.sourceAuthor === 'string' ? { sourceAuthor: metadata.sourceAuthor.slice(0, 255) } : {}),
      imported: metadata.imported === true,
      needsReview: metadata.needsReview === true,
      ...(metadata.position === 'secondary' ? { position: 'secondary' } : {}) };
    const saved = await saveChartRecord(scope, section, Number(req.user.id), value, Number(req.user.id), revision);
    res.set('Cache-Control', 'no-store').json({ revision: saved.revision });
  } catch (error) { next(error); }
}

export async function importChartSection(req, res, next) {
  try {
    const scope = await scopeOf(req), section = sectionOf(req), text = textOf(req).trim();
    if (!text) throw Object.assign(new Error('Paste content before importing'), { status: 400 });
    const position = req.body?.position || 'primary';
    if (!['primary','secondary'].includes(position)) throw Object.assign(new Error('Choose primary or secondary coverage'), { status: 400 });
    const result = await importSupplementaryChartSection(scope, section, text, Number(req.user.id), { position });
    await logAuditEvent(req, { actionType: 'client_chart_section_imported', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId, metadata: { section } });
    res.set('Cache-Control', 'no-store').json({ result });
  } catch (error) { next(error); }
}

export async function getChartSupplementaryRecords(req, res, next) {
  try {
    const scope = await scopeOf(req);
    const [contacts, comments, insurance, payer, billingComments] = await Promise.all([readChartRecord(scope, 'contacts'), readChartRecord(scope, 'comments'), readClientInsurance(scope.clientId, scope.agencyId), readChartRecord(scope, 'payer'), readChartRecord(scope, 'billingComments')]);
    await logAuditEvent(req, { actionType: 'client_chart_supplementary_viewed', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId });
    res.set('Cache-Control', 'no-store').json({ contacts: Object.values(contacts.value || {}), administrativeNote: comments.value?.message || '', insurance: insurance ? { primary: insurance.primary, secondary: insurance.secondary } : null, payer: payer.value, billingComments: billingComments.value?.message || '' });
  } catch (error) { next(error); }
}
