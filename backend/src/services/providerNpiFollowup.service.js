import crypto from 'node:crypto';
import { NPI_STATUS_FIELDS, NPI_NUMBER_FIELDS, NPI_FOLLOWUP_SOURCE, NPI_AUTOMATION, providerNpiState, npiTaskContent } from './providerNpiFollowup.policy.js';

export async function loadProviderNpiCandidates({ sinceDate, userId = null, agencyIds = null } = {}, db) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
  const cutoff = sinceDate || new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('Use a YYYY-MM-DD NPI audit cutoff.');
  if (userId != null && (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1)) throw new Error('Invalid provider ID.');
  if (agencyIds && !agencyIds.length) return [];
  const params = [cutoff, cutoff, cutoff, cutoff, NPI_FOLLOWUP_SOURCE];
  let scope = '';
  if (userId != null) { scope += ' AND u.id=?'; params.push(Number(userId)); }
  if (agencyIds) { scope += ` AND a.id IN (${agencyIds.map(() => '?').join(',')})`; params.push(...agencyIds); }
  const [providers] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.status,
    u.created_at,u.hired_at,u.provider_start_date,ua.agency_id,a.name AS agency_name,
    h.onboarding_started_at,
    (u.created_at>=? OR u.hired_at>=? OR u.provider_start_date>=? OR h.onboarding_started_at>=? OR u.status='ONBOARDING') AS in_cohort
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      AND COALESCE(a.organization_type,'agency')='agency'
    LEFT JOIN hire_journeys h ON h.user_id=u.id AND h.agency_id=ua.agency_id
    WHERE u.role IN ('provider','provider_plus','clinical_practice_assistant','intern')
      AND u.status IN ('PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING','ACTIVE_EMPLOYEE')
      AND COALESCE(u.is_archived,0)=0 AND u.is_demo=0
      AND a.slug NOT REGEXP '(^demo|demo$|synthetic|(^|-)qa(-|$))'
      AND (EXISTS(SELECT 1 FROM tasks t WHERE t.source_ref_type=? AND t.source_ref_id=CONCAT(a.id,':',u.id))
        OR u.status='ONBOARDING' OR u.created_at>=? OR u.hired_at>=? OR u.provider_start_date>=? OR h.onboarding_started_at>=?)
      ${scope} ORDER BY a.id,u.id`, [...params.slice(0, 5), cutoff, cutoff, cutoff, cutoff, ...params.slice(5)]);
  if (!providers.length) return [];
  const ids = [...new Set(providers.map(p => Number(p.id)))];
  const keys = [...NPI_STATUS_FIELDS, ...NPI_NUMBER_FIELDS];
  const [fields] = await db.execute(`SELECT v.id,v.user_id,f.agency_id,f.field_key,v.value,v.updated_at
    FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id
    WHERE v.user_id IN (${ids.map(() => '?').join(',')}) AND f.field_key IN (${keys.map(() => '?').join(',')})`, [...ids, ...keys]);
  return providers.map(p => ({ ...p, npi: providerNpiState(fields.filter(f => Number(f.user_id) === Number(p.id)
    && (f.agency_id == null || Number(f.agency_id) === Number(p.agency_id)))) }));
}

export async function loadNpiCredentialingTeam(db, expand, profiles) {
  const modern = await profiles.ready(db);
  const [grants] = await db.execute(`SELECT u.id AS user_id,${modern?'p':'ua'}.agency_id FROM users u
    ${modern ? "JOIN user_agency_access_profiles p ON p.user_id=u.id AND JSON_EXTRACT(p.effective_permissions,'$.can_manage_credentialing')=TRUE" : 'JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1 AND ua.can_manage_credentialing=1'}
    JOIN agencies a ON a.id=${modern?'p':'ua'}.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.is_demo=0
      AND COALESCE(u.is_assistant_account,0)=0 AND u.role IN ('admin','staff','support','super_admin','provider','provider_plus','supervisor','clinical_practice_assistant','billing')
      AND u.status='ACTIVE_EMPLOYEE' ORDER BY u.id,${modern?'p':'ua'}.agency_id`);
  const users = new Map();
  for (const grant of grants) {
    if (!users.has(Number(grant.user_id))) users.set(Number(grant.user_id), []);
    users.get(Number(grant.user_id)).push(Number(grant.agency_id));
  }
  const team = [];
  for (const [id, seeds] of users) team.push({ id, agencies: modern ? await profiles.grants(id,db) : await expand(seeds) });
  return team;
}

async function audit(db, append, taskId, action, providerId, details) {
  const metadata = { automation: NPI_AUTOMATION, actorType: 'automation', ...details };
  await db.execute(`INSERT INTO task_audit_log (task_id,action_type,actor_user_id,target_user_id,metadata)
    VALUES (?,?,NULL,?,?)`, [taskId, action, providerId, JSON.stringify(metadata)]);
  await append({ requestId: crypto.randomUUID(), phase: 'maintenance', userId: null,
    email: null, role: 'automation', method: 'SYSTEM', route: 'automation/provider-npi-followups',
    clientIp: null, ipSource: 'system_automation', peerIp: null,
    action: 'provider_npi_followup_updated', outcome: 'success', statusCode: 200,
    details: { taskId, providerId, ...metadata } }, db);
}

async function reconcileOne(provider, team, db, append) {
  const sourceId = `${provider.agency_id}:${provider.id}`;
  await db.beginTransaction();
  try {
    const [[existing]] = await db.execute('SELECT id,status,assigned_to_user_id,metadata FROM tasks WHERE source_ref_type=? AND source_ref_id=? FOR UPDATE', [NPI_FOLLOWUP_SOURCE, sourceId]);
    if (provider.npi.complete) {
      if (existing && !['completed','overridden'].includes(existing.status)) {
        await db.execute("UPDATE tasks SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?", [existing.id]);
        await audit(db, append, existing.id, 'completed', provider.id, { reason: 'NPI recorded with valid format and checksum' });
        await db.execute("UPDATE notifications SET is_resolved=1 WHERE related_entity_type='task' AND related_entity_id=? AND actor_source=?", [existing.id, NPI_AUTOMATION]);
      }
      await db.commit();
      return { taskId: existing?.id || null, state: 'recorded', created: false };
    }
    const eligible = team.filter(t => t.agencies.includes(Number(provider.agency_id))).map(t => t.id);
    const primary = eligible.includes(Number(existing?.assigned_to_user_id)) ? Number(existing.assigned_to_user_id) : eligible[0] || null;
    const content = npiTaskContent(provider, provider.npi);
    let taskId = existing?.id;
    if (!taskId) {
      const [insert] = await db.execute(`INSERT INTO tasks
        (task_type,title,description,status,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,
         source_ref_type,source_ref_id,metadata,is_private,urgency)
        VALUES ('custom',?,?,'pending',?,?,NULL,?,?,?,1,?)`,
      [content.title,content.description,primary,provider.agency_id,NPI_FOLLOWUP_SOURCE,sourceId,JSON.stringify(content.metadata),provider.npi.requestedHelp?'high':'medium']);
      taskId = insert.insertId;
    }
    const [collaborators] = await db.execute('SELECT user_id FROM task_collaborators WHERE task_id=?', [taskId]);
    const prior = new Set([Number(existing?.assigned_to_user_id), ...collaborators.map(c => Number(c.user_id))].filter(Boolean));
    const meta = typeof existing?.metadata === 'string' ? JSON.parse(existing.metadata) : existing?.metadata;
    const reopened = existing && ['completed','overridden'].includes(existing.status);
    const changed = !existing || reopened || meta?.npiState !== provider.npi.state
      || meta?.npiAnswer !== provider.npi.answer || meta?.accountStatus !== provider.status
      || prior.size !== eligible.length || eligible.some(id => !prior.has(id));
    if (changed) {
      if (existing) await db.execute(`UPDATE tasks SET title=?,description=?,assigned_to_user_id=?,metadata=?,urgency=?,
        status=IF(status IN ('completed','overridden'),'pending',status),completed_at=NULL WHERE id=?`,
      [content.title,content.description,primary,JSON.stringify(content.metadata),provider.npi.requestedHelp?'high':'medium',taskId]);
      await db.execute('DELETE FROM task_collaborators WHERE task_id=?', [taskId]);
      for (const id of eligible.filter(id => id !== primary)) await db.execute('INSERT INTO task_collaborators (task_id,user_id) VALUES (?,?)', [taskId,id]);
      // Notice and assignment are committed together, so a worker retry cannot
      // duplicate an assignment or lose its notification after a process crash.
      for (const id of eligible.filter(id => !prior.has(id) || reopened || (existing && meta?.npiState !== provider.npi.state))) {
        await db.execute(`INSERT INTO notifications
          (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
          VALUES ('custom_task_assigned','info','NPI credentialing follow-up',?,?,?,'task',?,NULL,?)`,
        [`A shared NPI follow-up is ready in your Task Hub: ${content.title}`,id,provider.agency_id,taskId,NPI_AUTOMATION]);
      }
      for (const id of [...prior].filter(id => !eligible.includes(id))) await db.execute(
        "UPDATE notifications SET is_resolved=1 WHERE user_id=? AND related_entity_type='task' AND related_entity_id=? AND actor_source=?", [id,taskId,NPI_AUTOMATION]);
      await audit(db, append, taskId, existing ? 'updated' : 'assigned', provider.id,
        { agencyId: Number(provider.agency_id), npiState: provider.npi.state, assigneeUserIds: eligible, unassigned: !eligible.length });
    }
    await db.commit();
    return { taskId, state: provider.npi.state, created: !existing, assigneeUserIds: eligible };
  } catch (error) { await db.rollback(); throw error; }
}

export async function reconcileProviderNpiFollowups(options = {}, overrides = {}) {
  if(options.agencyIds && !options.agencyIds.length)return {checked:0,created:0,results:[]};
  const pool = overrides.db || (await import('../config/database.js')).default;
  const expand = overrides.expand || (await import('./credentialingAccess.service.js')).expandCredentialingGrants;
  const profileService = overrides.profiles || await import('./agencyAccessProfiles.service.js');
  const profiles = overrides.profiles || { ready:profileService.accessProfileSchemaReady,
    grants:(id,db)=>profileService.agencyIdsWithPermission(id,'can_manage_credentialing',db) };
  const append = overrides.audit || (await import('./securityEvidence.service.js')).appendSecurityEvidence;
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.execute("SELECT GET_LOCK('provider_npi_followups',0) AS acquired");
    locked = Number(lock?.acquired) === 1;
    if (!locked) return { skipped: true, reason: 'already_running' };
    const providers = await loadProviderNpiCandidates(options, db);
    const team = await loadNpiCredentialingTeam(db, expand, profiles);
    const results = [];
    for (const provider of providers) results.push({ providerId: provider.id, agencyId: provider.agency_id,
      ...await reconcileOne(provider, team, db, append) });
    const params=[NPI_FOLLOWUP_SOURCE];
    let filter='';
    if(options.userId!=null){filter+=' AND JSON_EXTRACT(metadata,\'$.providerUserId\')=?';params.push(Number(options.userId));}
    if(options.agencyIds){filter+=` AND assigned_to_agency_id IN (${options.agencyIds.map(()=>'?').join(',')})`;params.push(...options.agencyIds);}
    const [openTasks]=await db.execute(`SELECT id,source_ref_id,metadata FROM tasks
      WHERE source_ref_type=? AND status IN ('pending','in_progress','waiting')${filter}`,params);
    const current=new Set(providers.map(p=>`${p.agency_id}:${p.id}`));
    for(const task of openTasks.filter(t=>!current.has(t.source_ref_id))){
      await db.beginTransaction();
      try{
        await db.execute("UPDATE tasks SET status='overridden',completed_at=UTC_TIMESTAMP(),assigned_to_user_id=NULL WHERE id=?",[task.id]);
        await db.execute('DELETE FROM task_collaborators WHERE task_id=?',[task.id]);
        await db.execute("UPDATE notifications SET is_resolved=1 WHERE related_entity_type='task' AND related_entity_id=? AND actor_source=?",[task.id,NPI_AUTOMATION]);
        await audit(db,append,task.id,'overridden',Number(String(task.source_ref_id).split(':')[1]),{reason:'Provider or agency no longer eligible for NPI follow-up'});
        await db.commit();
      }catch(error){await db.rollback();throw error;}
    }
    return { checked: providers.length, created: results.filter(r => r.created).length, results };
  } finally {
    try { if (locked) await db.execute("SELECT RELEASE_LOCK('provider_npi_followups')"); }
    finally { db.release(); }
  }
}

// Called after writes; the periodic worker retries failures without turning a
// successful profile save into an error or assigning work as the editing human.
export async function refreshProviderNpiFollowup(userId, fieldKey) {
  if (fieldKey && ![...NPI_STATUS_FIELDS,...NPI_NUMBER_FIELDS].includes(fieldKey)) return;
  try { await reconcileProviderNpiFollowups({ userId: Number(userId) }); }
  catch (error) { console.error('[provider NPI follow-up]', error?.code || 'reconcile_failed'); }
}

export async function assertProviderNpiTaskStatus(taskId, status, db) {
  if (status !== 'completed') return;
  const [[task]] = await db.execute('SELECT source_ref_type,source_ref_id FROM tasks WHERE id=?', [taskId]);
  if (task?.source_ref_type !== NPI_FOLLOWUP_SOURCE) return;
  const [agencyId, userId] = String(task.source_ref_id).split(':').map(Number);
  const providers = await loadProviderNpiCandidates({ userId, agencyIds: [agencyId] }, db);
  if (!providers[0]?.npi.complete) throw Object.assign(new Error('Record a valid individual NPI in the provider profile before completing this follow-up.'), { status: 409, statusCode: 409 });
}
