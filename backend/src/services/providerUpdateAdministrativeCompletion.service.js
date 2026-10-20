import pool from '../config/database.js';
import {assertAgencyAdmin, getPush, getRecipientBundle} from './providerUpdate.service.js';
import {createUpdateTimeClaim, updateTimeSummary} from './providerUpdateTime.service.js';
import {isProviderUpdatePreviewToken} from './providerUpdatePreviewLink.service.js';

export function handbookCompletionEligibility(sections = []) {
  const missing = sections.filter(section => !section.completed).map(section => section.key);
  return {eligible: sections.length > 0 && missing.every(key => key === 'handbook'), missing};
}

// Explicit administrative action, never a provider attestation or automatic waiver.
// The handbook override, completion receipt, audit event and existing time claim
// are committed together. Other outstanding requirements are never overridden.
export async function completeProviderUpdateAdministratively({recipientId, agencyId, pushId, actorUserId, reason, apply = false}) {
  if (![recipientId, agencyId, pushId, actorUserId].every(id => Number.isSafeInteger(id) && id > 0) || !String(reason || '').trim()) {
    throw Object.assign(Error('Recipient, agency, push, administrator and reason are required.'), {status: 400});
  }
  const [[actor]] = await pool.execute('SELECT id,role FROM users WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0', [actorUserId]);
  if (!actor) throw Object.assign(Error('Administrator not found.'), {status: 403});
  await assertAgencyAdmin(actor, agencyId);
  const push = await getPush(pushId);
  if (!push || Number(push.agency_id) !== agencyId || push.status !== 'sent' || push.title.startsWith('[PREVIEW]')) {
    throw Object.assign(Error('An active sent update in this agency is required.'), {status: 409});
  }
  const [[recipient]] = await pool.execute(`SELECT r.* FROM provider_update_recipients r JOIN users u ON u.id=r.provider_user_id
    WHERE r.id=? AND r.agency_id=? AND r.push_id=? AND COALESCE(r.is_demo_snapshot,0)=0 AND COALESCE(u.is_demo,0)=0
    AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
    AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)`,
  [recipientId, agencyId, pushId]);
  if (!recipient || isProviderUpdatePreviewToken(recipient.token)) throw Object.assign(Error('Active recipient not found.'), {status: 404});
  if (recipient.status === 'withdrawn') throw Object.assign(Error('This Provider Update is no longer assigned.'), {status: 410});
  if (recipient.finalized_at || recipient.locked_at) return {recipientId, changed: false, reason: 'already_locked'};
  // Read the same effective requirements as the editor, without creating progress rows.
  const bundle = await getRecipientBundle({...recipient, section_config_json: push.section_config_json, previewOnly: true});
  const eligibility = handbookCompletionEligibility(bundle.sections);
  if (!eligibility.eligible || !apply) return {recipientId, changed: false, ...eligibility};

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT * FROM provider_update_recipients WHERE id=? AND agency_id=? AND push_id=? FOR UPDATE', [recipientId, agencyId, pushId]);
    if (current?.status === 'withdrawn') throw Object.assign(Error('This Provider Update is no longer assigned.'), {status: 410});
    if (!current || current.locked_at || current.finalized_at) {
      await db.rollback();
      return {recipientId, changed: false, reason: 'already_locked'};
    }
    const [progress] = await db.execute('SELECT * FROM provider_update_section_progress WHERE recipient_id=? FOR UPDATE', [recipientId]);
    const enabledKeys = bundle.sections.map(section => section.key);
    const missing = enabledKeys.filter(key => key !== 'handbook' && !progress.some(row => row.section_key === key && Number(row.completed) === 1));
    if (missing.length) throw Object.assign(Error('Progress changed. Other sections are still incomplete.'), {status: 409, missing});
    const finalizedAt = new Date();
    const handbook = progress.find(row => row.section_key === 'handbook');
    const administrativeCompletion = {actorUserId, reason: reason.trim(), completedAt: finalizedAt.toISOString(), handbookRequirementWaived: enabledKeys.includes('handbook') && Number(handbook?.completed) !== 1};
    if (administrativeCompletion.handbookRequirementWaived) {
      const prior = typeof handbook?.data_json === 'string' ? JSON.parse(handbook.data_json) : handbook?.data_json || {};
      await db.execute(`INSERT INTO provider_update_section_progress (recipient_id,section_key,mode,status,completed,completed_at,data_json)
        VALUES (?,'handbook','ack','completed',1,?,?) ON DUPLICATE KEY UPDATE status='completed',completed=1,completed_at=VALUES(completed_at),data_json=VALUES(data_json)`,
      [recipientId, finalizedAt, JSON.stringify({...prior, administrativeCompletion})]);
    }
    const sections = enabledKeys.map(section_key => ({section_key, completed: 1}));
    const summary = await updateTimeSummary(recipientId, db);
    await db.execute(`UPDATE provider_update_recipients SET status='finalized',finalized_at=?,finalized_by_actor_type='admin',
      finalized_by_user_id=?,locked_at=?,snapshot_json=? WHERE id=?`,
    [finalizedAt, actorUserId, finalizedAt, JSON.stringify({enabledKeys, sections, activeSeconds: Number(current.active_seconds || 0), sectionSeconds: summary.sections, finalizedAt, administrativeCompletion}), recipientId]);
    await db.execute(`INSERT INTO provider_update_view_events (recipient_id,event_type,section_key,metadata_json) VALUES (?,'admin_completion',?,?)`,
    [recipientId, administrativeCompletion.handbookRequirementWaived ? 'handbook' : null, JSON.stringify({...administrativeCompletion, priorHandbookProgress: handbook || null})]);
    await createUpdateTimeClaim(db, {...current, finalized_at: finalizedAt}, actorUserId);
    await (await import('./providerUpdateTasks.service.js')).closeProviderUpdateTasks(db, recipientId);
    await db.commit();
    return {recipientId, changed: true, handbookRequirementWaived: administrativeCompletion.handbookRequirementWaived};
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
