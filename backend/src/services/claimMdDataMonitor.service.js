import pool from '../config/database.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';
import { contractHash, inspectReturnedFields, publicIssuePath, comparePublishedContract, parsePublishedState } from './claimMdDataContract.js';

const supportedAgencies = new Set([2, 6, 377]);
const technologyAgency = 2;
const day = 24 * 60 * 60 * 1000;
const failureKinds = new Set(['invalid_api_response', 'profile_import_failed', 'evidence_storage_failed', 'published_contract_unavailable']);

export async function recordDataGaps(agencyId, issues, db = pool) {
  if (agencyId !== 0 && !supportedAgencies.has(Number(agencyId))) return;
  if (!issues.length) return;
  const rows = [];
  for (const issue of issues) {
    const payerId = /^[A-Za-z0-9_-]{1,32}$/.test(String(issue.payerId || '')) ? String(issue.payerId) : '';
    const key = contractHash([Number(agencyId), payerId, issue.endpoint, issue.path, issue.kind, issue.revision || '']);
    const encrypted = encryptFamilyBilling({ path: issue.path }, `claimmd-data-gap:${key}`);
    rows.push([Number(agencyId), payerId, key, issue.endpoint, issue.kind, publicIssuePath(issue), encrypted]);
  }
  await db.execute(`INSERT INTO claimmd_data_gaps
    (agency_id,payer_id,issue_key,endpoint,issue_kind,public_path,path_encrypted) VALUES ${rows.map(()=>'(?,?,?,?,?,?,?)').join(',')}
    ON DUPLICATE KEY UPDATE last_seen_at=CURRENT_TIMESTAMP(6),occurrences=occurrences+1`, rows.flat());
}

// Monitoring is supplementary: it must never turn an accepted claim submission
// into a failed request that a caller might retry and duplicate.
export async function observeClaimMdData({ agencyId, payerId, endpoint, result, failure }, deps = {}) {
  if (!supportedAgencies.has(Number(agencyId))) return;
  try {
    const issues = failure ? [{ endpoint, path: '$processing', kind: failureKinds.has(failure) ? failure : 'invalid_api_response' }]
      : inspectReturnedFields(endpoint, result);
    let timer;
    const saved = (deps.record || recordDataGaps)(Number(agencyId), issues.map(issue => ({...issue,payerId}))).catch(() => {
      console.warn('[claimmd data monitor] Finding persistence unavailable; technical monitoring requires attention');
    });
    // The write continues in the background if the monitoring database is slow.
    // Never hold an accepted claim behind its metadata inventory connection.
    try { await Promise.race([saved, new Promise(resolve => { timer=setTimeout(resolve,750); timer.unref?.(); })]); }
    finally { clearTimeout(timer); }
  } catch {
    // No payer values, credentials, or error messages in application logs.
    console.warn('[claimmd data monitor] Finding persistence unavailable; technical monitoring requires attention');
  }
}

async function publicText(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw Error('claimmd_contract_unavailable');
  if (Number(response.headers.get('content-length') || 0) > 2000000) throw Error('claimmd_contract_too_large');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 2000000) throw Error('claimmd_contract_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPublicContract(fetchImpl = globalThis.fetch) {
  const html = await publicText('https://api.claim.md/', fetchImpl);
  const file = html.match(/src=["'](redocly-state-[a-f0-9]+\.js)["']/)?.[1];
  if (!file) throw Error('claimmd_contract_format');
  return parsePublishedState(await publicText(`https://api.claim.md/${file}`, fetchImpl));
}

export function dataGapDigest(rows) {
  const groups = new Map();
  for (const row of rows) {
    const scope = Number(row.agency_id) === 0 ? 'Published API' : ({2:'ITSCO',6:'NLU',377:'Inner Strength'}[row.agency_id] || 'Agency');
    const key = `${scope}${row.payer_id ? ` / Payer ${row.payer_id}` : ''} / ${row.endpoint} / ${row.issue_kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.public_path);
  }
  const details = [...groups].map(([key, paths]) => `${key}\n${paths.map(path => `  ${path}`).join('\n')}`).join('\n\n');
  return {
    subject: `AuricWell: ${rows.length} payer-data integration findings for Technology`,
    text: `Technology team,\n\nThe billing data monitor found ${rows.length} new integration findings.\n\n${details}\n\n“Without dedicated mapping” means the field is not assigned to a specific application feature. Eligibility responses remain available in the billing profile; retained evidence is different from automatic field population. Published fields and endpoints show potential availability, not a guarantee that a payer will return them. Alternative formats need comparison before assuming they add data.\n\nPlease assess the importers and update the reviewed coverage contract after implementing or explicitly documenting each decision. Unknown field names are encrypted in claimmd_data_gaps; this email contains no patient values, identifiers, response bodies, or account keys.\n\nReference: https://api.claim.md/\nNo additional eligibility inquiries were sent by this monitor.`
  };
}

export async function runClaimMdDataMonitor(deps = {}) {
  const canRun = deps.canRun || (await import('./schedulingWorkerGate.js')).canRunSchedulingMaintenance;
  if (!await canRun()) return { skipped: 'inactive_revision' };
  const db = await (deps.pool || pool).getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.execute("SELECT GET_LOCK('claimmd-data-monitor',0) acquired");
    if (!Number(lock?.acquired)) return { skipped: 'already_running' };
    locked = true;
    const [[state]] = await db.execute('SELECT * FROM claimmd_data_monitor_state WHERE id=1');
    if (!state) throw Error('claimmd_monitor_migration_required');
    const now = deps.now ? deps.now() : Date.now();
    if (!state.catalog_checked_at || now - new Date(state.catalog_checked_at).getTime() >= day) {
      // Mark the attempt first, including failures: repeated polls must not hammer
      // the documentation site. A failure itself creates a durable finding.
      await db.execute('UPDATE claimmd_data_monitor_state SET catalog_checked_at=UTC_TIMESTAMP() WHERE id=1');
      try { await recordDataGaps(0, comparePublishedContract(await (deps.fetchContract || fetchPublicContract)()), db); }
      catch { await recordDataGaps(0, [{endpoint:'documentation',path:'$catalog',kind:'published_contract_unavailable'}], db); }
    }
    if (state.digest_attempted_at && now - new Date(state.digest_attempted_at).getTime() < day) return { skipped: 'daily_digest_cooldown' };
    const [rows] = await db.execute("SELECT id,agency_id,payer_id,endpoint,issue_kind,public_path FROM claimmd_data_gaps WHERE notification_status='pending' ORDER BY id LIMIT 1000");
    if (!rows.length) return { findings: 0 };
    const resolveSender = deps.resolveSender || (await import('./providerUpdateEmailSender.service.js')).resolveProviderUpdateSender;
    const sender = await resolveSender(technologyAgency);
    const digestKey = contractHash(rows.map(row => row.id));
    const placeholders = rows.map(() => '?').join(',');
    // Durable attempt before transmission. Ambiguous sends are held for review,
    // never repeatedly emailed by another replica or a later worker run.
    await db.beginTransaction();
    await db.execute(`UPDATE claimmd_data_gaps SET notification_status='sending',digest_key=? WHERE id IN (${placeholders})`,[digestKey,...rows.map(row=>row.id)]);
    await db.execute("UPDATE claimmd_data_monitor_state SET digest_attempted_at=UTC_TIMESTAMP(),digest_status='sending' WHERE id=1");
    await db.commit();
    const message = dataGapDigest(rows);
    try {
      const notify = deps.notify || (async () => {
        const { technologyOwner } = await import('./technologySupport.service.js');
        const { default: Notification } = await import('../models/Notification.model.js');
        return Notification.create({userId:await technologyOwner(technologyAgency),agencyId:technologyAgency,type:'claimmd_data_gap',severity:'warning',title:'Payer-data integration needs Technology review',message:`${rows.length} new payer-data findings are recorded. Review the Technology email and claimmd_data_gaps inventory.`,actorSource:'Billing data monitor'});
      });
      const notification = await notify();
      await db.execute('UPDATE claimmd_data_monitor_state SET notification_id=? WHERE id=1',[notification?.id || null]);
    } catch { console.warn('[claimmd data monitor] In-app Technology notification needs attention'); }
    let status = 'unknown', communicationId = null;
    try {
      const send = deps.send || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
      const sent = await send({senderIdentityId:sender.identity.id,to:sender.replyTo,...message,source:'auto',templateType:'claimmd_data_gap_digest',internetMessageIdOverride:`<claimmd-data-${digestKey}@${sender.replyTo.split('@')[1]}>`});
      communicationId = sent?.communicationId || null;
      status = sent?.id ? 'sent' : sent?.queued ? 'queued' : sent?.blocked || sent?.skipped ? 'held' : 'unknown';
    } catch { /* Transport outcome may be ambiguous. Keep the durable finding. */ }
    await db.execute('UPDATE claimmd_data_gaps SET notification_status=?,communication_id=? WHERE digest_key=?',[status,communicationId,digestKey]);
    await db.execute('UPDATE claimmd_data_monitor_state SET digest_status=? WHERE id=1',[status]);
    return { findings: rows.length, status };
  } catch(error) {
    await db.rollback().catch(()=>{});
    throw error;
  } finally {
    if (locked) await db.execute("SELECT RELEASE_LOCK('claimmd-data-monitor')").catch(()=>{});
    db.release();
  }
}
