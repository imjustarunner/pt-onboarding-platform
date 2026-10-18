import { randomUUID } from 'node:crypto';
import { pool, open, list, create, get, update, transaction, audit } from './repository.js';
import { fail, text, has, requirePhi, requirePermission } from './policy.js';
import { patientAccess } from './clinical.js';
import { trySyncRequest, eligibleManagers, routingState, RECORDS_PERMISSION } from './recordsManagement.js';
import { requestFields, transitionRequest } from './recordsRequestsPolicy.js';

export async function publicPractices() {
  const [rows] = await pool.execute("SELECT id,slug,name,settings FROM auricwell_practices WHERE product='auricwell_ehr' AND status='active'");
  return rows.filter(p => open(p.settings, `auricwell:practice:${p.id}`).phiActivatedAt)
    .map(({ slug, name }) => ({ slug, name }));
}
export async function submitPublic(slug, input) {
  const [[p]] = await pool.execute("SELECT * FROM auricwell_practices WHERE slug=? AND product='auricwell_ehr' AND status='active'", [slug]);
  if (!p) throw fail(404, 'Practice unavailable. Contact your practice for help.');
  const ctx = { practiceId: p.id, accountId: randomUUID(), settings: open(p.settings, `auricwell:practice:${p.id}`) };
  requirePhi(ctx);
  const data = { ...requestFields(input), followUpAt: new Date(Date.now() + (ctx.settings.recordsManagement?.followUpDays || 7) * 86400000).toISOString() };
  const record = await transaction(async db => {
    return create(ctx, 'records_request', { ...data, source: 'website', status: 'pending_verification', requesterAccountId: null }, {}, db);
  });
  await trySyncRequest(ctx.practiceId, record.id);
  return { message: 'Your request was received. The practice will verify your identity and, if applicable, your authority to request these records before release. This does not confirm a patient record exists.' };
}
export async function submitPortal(ctx, input) {
  requirePhi(ctx);
  if (!['patient', 'guardian'].includes(ctx.actorType)) throw fail(403, 'Use a patient or guardian account to request your records.');
  const patient = await patientAccess(ctx, text(input.patientId, 'Patient', 36));
  const data = { ...requestFields(input), followUpAt: new Date(Date.now() + (ctx.settings.recordsManagement?.followUpDays || 7) * 86400000).toISOString() };
  const record = await transaction(db => create(ctx, 'records_request', {
    ...data, patientName: patient.data.name, source: 'portal', requesterAccountId: ctx.accountId,
    status: 'pending_review', identityMethod: 'authenticated_portal',
  }, { patientId: patient.id }, db));
  await trySyncRequest(ctx.practiceId, record.id);
  return record;
}
export async function requests(ctx) {
  requirePhi(ctx);
  if (ctx.actorType === 'staff') requirePermission(ctx, RECORDS_PERMISSION);
  const rows = await list(ctx, 'records_request', { limit: 10000 });
  await audit(ctx, 'records_request.listed', null);
  if (has(ctx, RECORDS_PERMISSION)) {
    const managers = await eligibleManagers(ctx);
    return rows.map(r => ({ ...r, data: { ...r.data, ...routingState(r, ctx.settings, managers) } }));
  }
  return rows.filter(r => r.data.requesterAccountId === ctx.accountId && ctx.patientIds.includes(r.patientId))
    .map(r => ({ id: r.id, createdAt: r.createdAt, data: {
      patientName: r.data.patientName, scope: r.data.scope, status: r.data.status,
      response: r.data.response || '',
    } }));
}
export async function review(ctx, id, input) {
  requirePhi(ctx);
  requirePermission(ctx, RECORDS_PERMISSION);
  await transaction(async db => {
    const record = await get(ctx, 'records_request', id, db, true);
    const data = transitionRequest(record.data, input, ctx.accountId);
    await update(ctx, record, data, db);
  });
  await trySyncRequest(ctx.practiceId, id);
  return { saved: true };
}
