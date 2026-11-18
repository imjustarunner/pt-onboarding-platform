import pool from '../config/database.js';
import { createHash } from 'node:crypto';
import { requireClientChartImportAccess } from '../services/clientChartImportAccess.service.js';
import { readChartRecord, saveChartRecord } from '../services/clientChartImport.service.js';
import { readClientInsurance, writeClientInsurance, claimInsuranceIssues } from '../services/clientInsurance.service.js';
import { listPayerSetupRequests, saveDirectoryPayer } from '../services/payerSetupCatalog.service.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';
import { fetchPayers } from '../services/claimMd.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

const asList = value => Array.isArray(value) ? value : value ? [value] : [];
const scopeOf = req => {
  if (!['super_admin','admin','support'].includes(req.user?.role)) throw Object.assign(new Error('Client account support access required for payer verification'), { status: 403 });
  return requireClientChartImportAccess(req.user, req.params.id, req.get?.('X-Agency-Id') || null);
};
function positionOf(req) {
  const position = req.body?.position || req.query?.position || 'primary';
  if (!['primary','secondary'].includes(position)) throw Object.assign(new Error('Choose primary or secondary coverage'), { status: 400 });
  return position;
}
function publicPayer(payer) { return { payerId: String(payer.payerid), name: payer.payer_name, claims: payer['1500_claims'] || 'unknown', eligibility: payer.eligibility || 'unknown' }; }
const fingerprint = policy => createHash('sha256').update(JSON.stringify(Object.keys(policy).sort().map(key => [key, policy[key]]))).digest('hex');

export async function getClientPayerReadiness(req, res, next) {
  try {
    const scope = await scopeOf(req);
    const [insurance, catalog, source, evidence] = await Promise.all([readClientInsurance(scope.clientId, scope.agencyId), listPayerSetupRequests(scope.agencyId, pool), readChartRecord(scope, 'payer'), readChartRecord(scope, 'payerLinks')]);
    const policies = ['primary', 'secondary'].map(position => {
      const policy = insurance?.[position];
      const hasInsurance = !!policy && ['insurerName','memberId','payerId','sourcePayerId'].some(key => policy[key]);
      const matches = policy?.payerId ? catalog.filter(row => row.directory_status === 'id_match' && String(row.claimmd_payer_id) === policy.payerId) : [];
      const verification = evidence.value?.[position];
      const verified = hasInsurance && !!verification && verification.payerId === policy.payerId && verification.policyFingerprint === fingerprint(policy);
      let capabilities = {};
      try { capabilities = typeof matches[0]?.directory_snapshot_json === 'string' ? JSON.parse(matches[0].directory_snapshot_json) : matches[0]?.directory_snapshot_json || {}; } catch { /* Display unknown support until refreshed. */ }
      return { position, hasInsurance, subscriberIsClient:policy?.relationshipToSubscriber==='self',insurerName: policy?.insurerName || '', sourcePayerId: policy?.sourcePayerId || source.value?.[position]?.sourcePayerId || '',
        payerId: policy?.payerId || '', linked: matches.length > 0 && (verified || insurance?.verifiedForClaims === true), directoryName: matches[0]?.directory_name || '', directoryCheckedAt: verified ? verification.checkedAt : matches[0]?.directory_checked_at || null,
        claimsSupport: capabilities['1500_claims'] || 'unknown', eligibilitySupport: capabilities.eligibility || 'unknown',
        missingFields: policy ? claimInsuranceIssues(policy) : ['Insurance is missing'] };
    });
    res.set('Cache-Control','no-store').json({ policies, source: source.value, coverageVerifiedForClaims: insurance?.verifiedForClaims === true });
  } catch (error) { next(error); }
}

export async function searchClientPayers(req, res, next) {
  try {
    const scope = await scopeOf(req), position = positionOf(req);
    const insurance = await readClientInsurance(scope.clientId, scope.agencyId);
    const source = (await readChartRecord(scope, 'payer')).value?.[position] || {};
    const policy = insurance?.[position] || {};
    const query = String(req.body?.search || '').trim();
    const sourceId = String(source.sourcePayerId || policy.sourcePayerId || policy.payerId || '').trim();
    const name = String(source.payerName || policy.insurerName || '').trim().slice(0,64);
    if (query && (query.length < 2 || query.length > 64)) throw Object.assign(new Error('Search with 2–64 characters'), { status: 400 });
    const catalog = await listPayerSetupRequests(scope.agencyId,pool);
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const terms = normalize(query).split(' ').filter(Boolean);
    const configured = catalog.filter(row => {
      const haystack=normalize([row.payer_name,row.directory_name,row.source_payer_id,row.claimmd_payer_id,row.source_names_json,row.review_note].join(' '));
      return !terms.length || terms.every(term=>haystack.includes(term));
    }).map(row => {
      let capabilities={};try{capabilities=typeof row.directory_snapshot_json==='string'?JSON.parse(row.directory_snapshot_json):row.directory_snapshot_json||{};}catch{}
      return { payerId:String(row.claimmd_payer_id||''), name:row.payer_name, directoryName:row.directory_name||'', source:'agency', catalogId:row.id,
        verified:row.directory_status==='id_match' && !!row.claimmd_payer_id, note:row.review_note||'',
        claims:capabilities['1500_claims']||'unknown',eligibility:capabilities.eligibility||'unknown' };
    });
    let payers=[],directoryWarning='';
    try {
      const connection=await resolveClaimMdConnection(scope.agencyId);
      if(!query && /^[A-Za-z0-9_-]{1,32}$/.test(sourceId))payers.push(...asList((await fetchPayers({accountKey:connection.accountKey,payerId:sourceId})).payer));
      if(query && /^[0-9]{2,32}$/.test(query))payers.push(...asList((await fetchPayers({accountKey:connection.accountKey,payerId:query})).payer));
      if((query||name).length>=2)payers.push(...asList((await fetchPayers({accountKey:connection.accountKey,payerName:query||name})).payer));
    } catch { directoryWarning='The live clearinghouse directory is unavailable. Agency payers are still shown; linking requires a fresh directory check.'; }
    const matchScore=payer=>normalize(payer.name)===normalize(name)||normalize(payer.directoryName)===normalize(name)?100:normalize(name).split(' ').filter(word=>word.length>2&&normalize([payer.name,payer.directoryName,payer.note].join(' ')).includes(word)).length;
    configured.sort((a,b)=>matchScore(b)-matchScore(a));
    const configuredIds=new Set(configured.filter(row=>row.payerId && row.verified).map(row=>row.payerId));
    const directory=[...new Map(payers.map(payer=>[String(payer.payerid),payer])).values()].filter(payer=>!configuredIds.has(String(payer.payerid))).slice(0,100).map(payer=>({...publicPayer(payer),source:'directory',verified:true}));
    res.set('Cache-Control','no-store').json({payers:[...configured,...directory],directoryWarning});
  } catch (error) { next(error); }
}

export async function linkClientPayer(req, res, next) {
  try {
    const scope = await scopeOf(req), position = positionOf(req);
    const payerId = String(req.body?.payerId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(payerId) || req.body?.confirmed !== true) throw Object.assign(new Error('Confirm the matching directory payer'), { status: 400 });
    const connection = await resolveClaimMdConnection(scope.agencyId);
    const matches = asList((await fetchPayers({ accountKey: connection.accountKey, payerId })).payer).filter(payer => String(payer.payerid) === payerId);
    if (matches.length !== 1) throw Object.assign(new Error('The payer directory changed. Search again before linking.'), { status: 409 });
    const payer = matches[0];
    const catalog = await listPayerSetupRequests(scope.agencyId, pool);
    const configured = catalog.some(row => row.directory_status === 'id_match' && String(row.claimmd_payer_id) === payerId);
    if (!configured && !['super_admin','admin','support'].includes(req.user.role)) throw Object.assign(new Error('Ask support or an administrator to add this payer to the agency catalog'), { status: 403 });
    const insurance = await readClientInsurance(scope.clientId, scope.agencyId);
    if (!insurance?.[position]) throw Object.assign(new Error('Import this client’s insurance before linking its payer'), { status: 409 });
    if (['super_admin','admin','support'].includes(req.user.role)) {
      const db = await pool.getConnection();
      try { await saveDirectoryPayer({ agencyId: scope.agencyId, payer, actorUserId: req.user.id }, db); } finally { db.release(); }
    }
    const transaction = await pool.getConnection();
    let saved;
    try {
      await transaction.beginTransaction();
      await transaction.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [scope.clientId, scope.agencyId]);
      const current = await readClientInsurance(scope.clientId, scope.agencyId, transaction);
      if (!current?.[position] || JSON.stringify(current[position]) !== JSON.stringify(insurance[position])) throw Object.assign(new Error('The insurance changed during payer verification. Review it and retry.'), { status: 409 });
      saved = await writeClientInsurance({ ...current, ...scope, [position]: { ...current[position], payerId }, confirmedBy: req.user.id, verifiedForClaims: false, queueEligibility: false }, transaction);
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; } finally { transaction.release(); }
    await saveChartRecord(scope, 'payerLinks', 0, { [position]: { payerId, policyFingerprint: fingerprint(saved[position]), checkedAt: new Date().toISOString() } }, req.user.id);
    await logAuditEvent(req, { actionType: 'client_chart_payer_linked', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId, metadata: { position, payerId } });
    res.set('Cache-Control','no-store').json({ payer: publicPayer(payer), linked: true });
  } catch (error) { next(error); }
}
