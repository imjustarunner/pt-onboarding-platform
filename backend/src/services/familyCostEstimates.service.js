import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import pool from '../config/database.js';
import { positiveId, billingError, requireBillingLink, auditBilling } from './familyBillingPolicy.service.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';
import { transaction } from './familyLedger/policy.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import { getClaimMdBillingProfile, listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { getPrimaryClinicalDiagnosis } from './clinicalDiagnosisAttach.service.js';
import { ESTIMATE_DEFAULTS, ESTIMATE_ACKNOWLEDGMENT, buildCostEstimate, estimateDisclosure, estimateMoney } from './costEstimatePolicy.js';

const context = (agencyId, clientId) => `cost-estimate:${agencyId}:${clientId}`;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const code = value => { const result = String(value || '').trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(result)) throw billingError(400, 'Choose a service code'); return result; };
const safeText = (value, max = 255) => String(value || '').trim().slice(0, max);
async function event(db, { agencyId, clientId, estimateId = null, actorUserId, action, evidence }) {
  await db.execute('INSERT INTO family_cost_estimate_events (agency_id,estimate_id,actor_user_id,event_type,evidence_encrypted) VALUES (?,?,?,?,?)', [agencyId, estimateId, actorUserId, action, encryptFamilyBilling(evidence, `cost-estimate-event:${agencyId}`)]);
  await auditBilling({ agencyId, clientId, userId: actorUserId, action, objectId: estimateId }, db);
}
export async function listCostEstimateRates(agencyId, db = pool) {
  const [saved] = await db.execute('SELECT service_code AS serviceCode,description,amount_cents AS amountCents,unit_label AS unitLabel,approved,revision FROM agency_cost_estimate_rates WHERE agency_id=? ORDER BY service_code', [positiveId(agencyId)]);
  const existing = new Map(saved.map(row => [row.serviceCode, { ...row, amountCents: row.amountCents == null ? null : Number(row.amountCents), approved: Number(row.approved) === 1, revision: Number(row.revision) }]));
  return [...ESTIMATE_DEFAULTS.map(row => ({ ...row, ...(existing.get(row.serviceCode) || {}), source: existing.has(row.serviceCode) ? 'agency' : 'agency_supplied_draft_default' })), ...saved.filter(row => !ESTIMATE_DEFAULTS.some(d => d.serviceCode === row.serviceCode)).map(row => existing.get(row.serviceCode))];
}
export async function saveCostEstimateRate({ agencyId, actorUserId, serviceCode, description, amountCents, unitLabel = 'session', approved = false, revision = 0, reason }) {
  const service = code(serviceCode), amount = amountCents == null ? null : estimateMoney(amountCents);
  if (!safeText(description) || !safeText(unitLabel, 50) || !safeText(reason, 2000)) throw billingError(400, 'Record the description, unit and reason for this price');
  if (approved && ['99441', '99442', '99443'].includes(service)) throw billingError(400, 'Deleted telephone codes are retained for historical reference and cannot be approved for new estimates');
  if (approved && amount == null) throw billingError(400, 'An unspecified price cannot be approved');
  return transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    const [[previous]] = await db.execute('SELECT revision FROM agency_cost_estimate_rates WHERE agency_id=? AND service_code=? FOR UPDATE', [agencyId, service]);
    if (Number(revision) !== Number(previous?.revision || 0)) throw billingError(409, 'This price changed. Refresh before saving');
    const next = Number(revision) + 1;
    await db.execute('INSERT INTO agency_cost_estimate_rates (agency_id,service_code,description,amount_cents,unit_label,approved,revision,reviewed_by_user_id,reviewed_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE description=VALUES(description),amount_cents=VALUES(amount_cents),unit_label=VALUES(unit_label),approved=VALUES(approved),revision=VALUES(revision),reviewed_by_user_id=VALUES(reviewed_by_user_id),reviewed_at=VALUES(reviewed_at)', [agencyId, service, safeText(description), amount, safeText(unitLabel, 50), approved === true ? 1 : 0, next, actorUserId]);
    await event(db, { agencyId, actorUserId, action: 'cost_estimate_price_reviewed', evidence: { serviceCode: service, amountCents: amount, approved: approved === true, revision: next, reason: safeText(reason, 2000) } });
    return { serviceCode: service, revision: next };
  });
}
async function requireRecipient(agencyId, clientId, userId, db = pool) {
  await requireBillingLink(userId, clientId, agencyId, db);
  const access = await clinicalAccess({ agencyId, clientId, userId }, db);
  if (!access.scopes.includes('clinical_documents')) throw billingError(403, 'Clinical document access must be verified before sharing this estimate');
}
export async function costEstimateClientContext({ agencyId, clientId, guardianUserId, officeId, serviceLocation = {} }, db = pool) {
  const [[client]] = await db.execute('SELECT c.id,c.full_name,c.date_of_birth,c.provider_id,u.first_name,u.last_name FROM clients c LEFT JOIN users u ON u.id=c.provider_id WHERE c.id=? AND c.agency_id=?', [positiveId(clientId), positiveId(agencyId)]);
  if (!client?.provider_id) throw billingError(409, 'Assign a provider to this client before preparing an estimate');
  const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1', [client.provider_id, agencyId]);
  if (!membership) throw billingError(409, 'The assigned provider is not active in this agency');
  await requireRecipient(agencyId, clientId, positiveId(guardianUserId), db);
  const [[agency]] = await db.execute('SELECT id,name,slug,logo_url FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0', [agencyId]);
  if (!agency) throw billingError(404, 'Agency not found');
  const insurance = await readClientInsurance(clientId, agencyId, db);
  if (hasMedicaidCoverage(insurance)) throw billingError(409, 'Medicaid-covered care does not need a patient-pay estimate');
  const [npiRows] = await db.execute("SELECT v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE v.user_id=? AND d.field_key IN ('provider_identity_npi_number','npi_number','npi_id')", [client.provider_id]);
  const npis = [...new Set(npiRows.map(row => safeText(row.value)).filter(Boolean))];
  const billingProfile = officeId ? await getClaimMdBillingProfile(agencyId, officeId, { requireComplete: false }) : null;
  const diagnosis = await getPrimaryClinicalDiagnosis({ agencyId, clientId });
  const serviceAtOffice = serviceLocation.useBillingOfficeAddress === true;
  const location = { officeId: officeId || null, address: serviceAtOffice && billingProfile ? [billingProfile.practice.street_address, billingProfile.practice.city, billingProfile.practice.state, billingProfile.practice.postal_code].filter(Boolean).join(', ') : safeText(serviceLocation.address, 500), state: serviceAtOffice ? billingProfile?.practice.state || '' : safeText(serviceLocation.state, 2).toUpperCase() };
  return { agency: { id: agencyId, name: agency.name, slug: agency.slug, logoUrl: agency.logo_url, npi: billingProfile?.billingNpi || '', taxId: billingProfile?.practice.tax_id || '' }, provider: { id: Number(client.provider_id), name: [client.first_name, client.last_name].filter(Boolean).join(' '), npi: npis.length === 1 ? npis[0] : '' }, patient: { id: clientId, name: client.full_name, dateOfBirth: client.date_of_birth instanceof Date ? client.date_of_birth.toISOString().slice(0, 10) : String(client.date_of_birth || '').slice(0, 10) }, location, diagnosisCodes: diagnosis?.icd10_code ? [diagnosis.icd10_code] : [], hasCoverage: !!(insurance?.primary?.memberId || insurance?.secondary?.memberId), medicaid: false, insuranceFingerprint: hash(insurance) };
}
export async function costEstimateOptions(agencyId) {
  const [rates, offices] = await Promise.all([listCostEstimateRates(agencyId), listClaimMdBillingProfiles(agencyId)]);
  return { rates, offices, templates: [{ id: 'good_faith_estimate', title: 'Good Faith Estimate', description: 'An individualized estimate for uninsured clients or clients choosing not to use commercial insurance. Receipt acknowledgment is optional and does not waive rights.' }, { id: 'payment_authorization', title: 'Payment authorization', description: 'Assign separately through Payment setup. Saving a card and estimate acknowledgment do not authorize recurring charges.' }] };
}
export async function createCostEstimate(input) {
  const { agencyId, actorUserId } = input, clientId = positiveId(input.clientId), guardianUserId = positiveId(input.guardianUserId);
  if (!/^[a-zA-Z0-9:_-]{8,100}$/.test(input.requestKey || '')) throw billingError(400, 'A request key is required');
  const source = await costEstimateClientContext({ agencyId, clientId, guardianUserId, officeId: input.officeId, serviceLocation: input.serviceLocation }), rates = await listCostEstimateRates(agencyId);
  if (!Array.isArray(input.lines) || input.lines.length > 30) throw billingError(400, 'Select the expected services');
  const lines = input.lines.map(line => {
    const rate = rates.find(row => row.serviceCode === code(line.serviceCode));
    if (!rate || Number(line.rateRevision) !== Number(rate.revision)) throw billingError(409, 'Refresh the price catalog before preparing this estimate');
    return { ...rate, quantity: line.quantity };
  });
  const snapshot = buildCostEstimate({ ...source, startDate: input.startDate, weeks: input.weeks ?? 6, frequency: input.frequency, lines, diagnosisNotApplicable: input.diagnosisNotApplicable, diagnosisReason: input.diagnosisReason, coverageEvidence: input.coverageEvidence, selfPayElection: input.selfPayElection, separatelyScheduled: input.separatelyScheduled || [] });
  snapshot.insuranceFingerprint = source.insuranceFingerprint;
  const requestHash = hash({ ...input, actorUserId: undefined, ip: undefined, userAgent: undefined });
  return transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    await requireRecipient(agencyId, clientId, guardianUserId, db);
    const [[prior]] = await db.execute('SELECT id,request_hash FROM family_cost_estimates WHERE agency_id=? AND request_key=?', [agencyId, input.requestKey]);
    if (prior) { if (prior.request_hash !== requestHash) throw billingError(409, 'This request key already belongs to another estimate'); return { id: prior.id, existing: true }; }
    const [result] = await db.execute('INSERT INTO family_cost_estimates (agency_id,client_id,guardian_user_id,provider_user_id,request_key,request_hash,snapshot_encrypted,snapshot_hash,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)', [agencyId, clientId, guardianUserId, source.provider.id, input.requestKey, requestHash, encryptFamilyBilling(snapshot, context(agencyId, clientId)), hash(snapshot), actorUserId]);
    await event(db, { agencyId, clientId, actorUserId, estimateId: result.insertId, action: 'cost_estimate_prepared', evidence: { snapshotHash: hash(snapshot) } });
    return { id: result.insertId, status: 'draft', missing: snapshot.missing };
  });
}
export async function getCostEstimate({ agencyId, estimateId, userId, staff = false, auditRead = true }, db = pool, lock = false) {
  const [[row]] = await db.execute(`SELECT * FROM family_cost_estimates WHERE id=? AND agency_id=?${lock ? ' FOR UPDATE' : ''}`, [positiveId(estimateId), positiveId(agencyId)]);
  if (!row || (!staff && (Number(row.guardian_user_id) !== Number(userId) || row.status === 'draft'))) throw billingError(404, 'Estimate not found');
  if (!staff) await requireRecipient(agencyId, row.client_id, userId, db);
  const snapshot = decryptFamilyBilling(row.snapshot_encrypted, context(agencyId, row.client_id));
  if (hash(snapshot) !== row.snapshot_hash) throw billingError(409, 'Estimate integrity could not be verified');
  if (auditRead && userId) await auditBilling({ agencyId, clientId: row.client_id, userId, action: 'cost_estimate_viewed', objectId: row.id }, db);
  return { id: row.id, agencyId: row.agency_id, clientId: row.client_id, guardianUserId: row.guardian_user_id, status: row.status, snapshot, snapshotHash: row.snapshot_hash, issuedAt: row.issued_at, acknowledgedAt: row.acknowledged_at, acknowledgment: row.acknowledgment_encrypted ? decryptFamilyBilling(row.acknowledgment_encrypted, context(agencyId, row.client_id)) : null };
}
export async function listCostEstimates({ agencyId, userId, clientId = null, staff = false }) {
  const params = [positiveId(agencyId)], filters = [];
  if (clientId) { filters.push('client_id=?'); params.push(positiveId(clientId)); }
  if (!staff) { filters.push("guardian_user_id=? AND status<>'draft'"); params.push(positiveId(userId)); }
  const [rows] = await pool.execute(`SELECT id FROM family_cost_estimates WHERE agency_id=?${filters.length ? ` AND ${filters.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 100`, params);
  const result = [];
  for (const row of rows) { try { const value = await getCostEstimate({ agencyId, userId, estimateId: row.id, staff, auditRead: false }); result.push({ id: value.id, clientId: value.clientId, guardianUserId: value.guardianUserId, clientName: value.snapshot.patient.name, title: value.snapshot.title, status: value.status, totalCents: value.snapshot.totalCents, startDate: value.snapshot.startDate, endDate: value.snapshot.endDate, missing: value.snapshot.missing, issuedAt: value.issuedAt, acknowledgedAt: value.acknowledgedAt }); } catch (error) { if (![403, 404].includes(error.status)) throw error; } }
  return result;
}
export async function issueCostEstimate({ agencyId, estimateId, actorUserId }) {
  return transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    const item = await getCostEstimate({ agencyId, estimateId, staff: true }, db, true);
    if (item.status !== 'draft') return { id: item.id, status: item.status, existing: true };
    await requireRecipient(agencyId, item.clientId, item.guardianUserId, db);
    const insurance = await readClientInsurance(item.clientId, agencyId, db);
    if (hasMedicaidCoverage(insurance) || item.snapshot.insuranceFingerprint !== hash(insurance)) throw billingError(409, 'Coverage changed. Prepare a new estimate');
    const [[client]] = await db.execute('SELECT provider_id FROM clients WHERE id=? AND agency_id=?', [item.clientId, agencyId]);
    if (Number(client?.provider_id) !== Number(item.snapshot.provider.id)) throw billingError(409, 'The assigned provider changed. Prepare a new estimate');
    const rates = await listCostEstimateRates(agencyId, db);
    if (item.snapshot.missing.length || item.snapshot.lines.some(line => { const rate = rates.find(row => row.serviceCode === line.serviceCode); return !rate?.approved || Number(rate.revision) !== Number(line.rateRevision); })) throw billingError(409, `Complete and review this estimate before issuing: ${item.snapshot.missing.join(', ') || 'agency prices changed'}`);
    await db.execute("UPDATE family_cost_estimates SET status='issued',issued_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=?", [estimateId, agencyId]);
    await event(db, { agencyId, clientId: item.clientId, estimateId, actorUserId, action: 'cost_estimate_issued', evidence: { snapshotHash: item.snapshotHash, delivery: 'secure_portal', acknowledgmentRequired: false } });
    return { id: estimateId, status: 'issued', emailSent: false };
  });
}
export async function acknowledgeCostEstimate({ agencyId, estimateId, userId, snapshotHash, accepted, signatureName, ip, userAgent }) {
  if (accepted !== true || safeText(signatureName).length < 2) throw billingError(400, 'Enter your name and acknowledge receiving this estimate');
  return transaction(async db => {
    const item = await getCostEstimate({ agencyId, estimateId, userId }, db, true);
    if (snapshotHash !== item.snapshotHash) throw billingError(409, 'Review the current estimate before acknowledging it');
    if (item.status === 'acknowledged') return { acknowledged: true, existing: true };
    if (item.status !== 'issued') throw billingError(409, 'This estimate is no longer awaiting acknowledgment');
    const evidence = { signatureName: safeText(signatureName), signedAt: new Date().toISOString(), userId, snapshotHash, text: ESTIMATE_ACKNOWLEDGMENT, ip: safeText(ip, 80), userAgent: safeText(userAgent, 500), paymentAuthorized: false, rightsWaived: false };
    await db.execute("UPDATE family_cost_estimates SET status='acknowledged',acknowledged_at=CURRENT_TIMESTAMP(6),acknowledgment_encrypted=? WHERE id=? AND agency_id=?", [encryptFamilyBilling(evidence, context(agencyId, item.clientId)), estimateId, agencyId]);
    await event(db, { agencyId, clientId: item.clientId, estimateId, actorUserId: userId, action: 'cost_estimate_received', evidence });
    return { acknowledged: true };
  });
}
export async function renderCostEstimatePdf(item) {
  const snapshot = item.snapshot || item;
  const pdf = await PDFDocument.create(), normal = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Embed local brand assets: no external image requests carrying document data.
  let portalLogo = null, agencyLogo = null;
  try { portalLogo = await pdf.embedPng(await fs.readFile(new URL('../assets/auricwell/logo.png', import.meta.url))); } catch { /* Text branding remains legible without optional assets. */ }
  const agencyLogoPath = String(snapshot.agency.slug || '').toLowerCase() === 'itsco' ? '../assets/providerActionPdf/itsco-logo.png' : ['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'].includes(String(snapshot.agency.slug || '').toLowerCase()) ? '../assets/costEstimates/nlu-logo.png' : null;
  if (agencyLogoPath) try { agencyLogo = await pdf.embedPng(await fs.readFile(new URL(agencyLogoPath, import.meta.url))); } catch { /* Agency name is always included. */ }
  let page, y;
  const drawLogo = (image, x, maxWidth) => { const scale = Math.min(maxWidth / image.width, 38 / image.height); page.drawImage(image, { x, y: 748, width: image.width * scale, height: image.height * scale }); };
  const addPage = () => { page = pdf.addPage([612, 792]); page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) }); page.drawRectangle({ x: 40, y: 739, width: 532, height: 2, color: rgb(.13, .30, .42) }); if (portalLogo) { drawLogo(portalLogo, 40, 150); page.drawText('AuricWell', { x: 86, y: 760, font: bold, size: 15, color: rgb(.13, .30, .42) }); } else page.drawText('AuricWell', { x: 40, y: 760, font: bold, size: 15, color: rgb(.13, .30, .42) }); if (agencyLogo) drawLogo(agencyLogo, 405, 167); y = 715; };
  addPage();
  const draw = (value, heading = false) => {
    const font = heading ? bold : normal, size = heading ? 13 : 10;
    let line = '';
    for (const word of String(value ?? '').replace(/[^\x20-\x7e\n]/g, ' ').split(/\s+/)) {
      if (font.widthOfTextAtSize(`${line} ${word}`, size) > 532 && line) { if (y < 48) addPage(); page.drawText(line, { x: 40, y, size, font }); y -= 15; line = word; } else line += (line ? ' ' : '') + word;
    }
    if (y < 48) addPage(); page.drawText(line, { x: 40, y, size, font }); y -= heading ? 24 : 21;
  };
  const money = cents => cents == null ? 'Price review required' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  draw(snapshot.agency.name, true);
  draw(snapshot.title, true);
  if (!item.status || item.status === 'draft') draw('DRAFT - not yet issued. Review the required information before sharing.', true);
  draw(`Client: ${snapshot.patient.name} | Date of birth: ${snapshot.patient.dateOfBirth}`);
  draw(`Assigned provider: ${snapshot.provider.name} | NPI: ${snapshot.provider.npi || 'Review required'}`);
  draw(`Billing organization: ${snapshot.agency.name} | NPI: ${snapshot.agency.npi || 'Review required'} | Tax ID: ${snapshot.agency.taxId || 'Review required'}`);
  draw(`Service location: ${snapshot.location.address || 'Review required'}`);
  draw(`Period: ${snapshot.startDate} through ${snapshot.endDate} | ${snapshot.frequency}`);
  draw(`Diagnosis: ${snapshot.diagnosisCodes?.join(', ') || snapshot.diagnosisReason || 'Review required'}`);
  draw('Expected services', true);
  for (const line of snapshot.lines) draw(`${line.serviceCode} | ${line.description} | ${line.quantity} ${line.unitLabel}${line.quantity === 1 ? '' : 's'} at ${money(line.amountCents)} | ${money(line.totalCents)}`);
  draw(`Total estimated cost without insurance: ${money(snapshot.totalCents)}`, true);
  if (snapshot.separatelyScheduled?.length) { draw('Separately scheduled services', true); draw('Ask billing for a separate estimate when these services are scheduled or upon request.'); snapshot.separatelyScheduled.forEach(line => draw(line)); }
  estimateDisclosure(snapshot).forEach(line => draw(line));
  if (item.acknowledgment) { draw('Receipt acknowledged', true); draw(`${item.acknowledgment.signatureName} | ${item.acknowledgment.signedAt}`); draw(ESTIMATE_ACKNOWLEDGMENT); }
  else draw('You can view, save and print this estimate without signing. Receipt acknowledgment is optional.');
  for (const [index, p] of pdf.getPages().entries()) p.drawText(`Private client document | ${item.id ? `Estimate ${item.id} | ` : ''}Page ${index + 1}`, { x: 40, y: 24, size: 8, font: normal, color: rgb(.4, .4, .4) });
  return Buffer.from(await pdf.save());
}
