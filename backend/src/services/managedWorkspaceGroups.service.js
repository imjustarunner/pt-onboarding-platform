import { APP_GROUP_OWNER, ensureAppGroupMember } from './appGroupOwnership.service.js';
import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { managedDomain, managedGroupScope, activeManagedStaff, buildManagedGroupPlan, CURRENT_MANAGED_DOMAINS } from './managedWorkspaceGroupPolicy.js';
import { scopeProviderRow } from '../utils/providerAgencyAvailability.js';
import { ensurePersonalMailboxForAddress } from './personalMailbox.service.js';
import { DEPARTMENTAL_GROUPS, groupKeyForIdentity } from './departmentalGroupPolicy.js';
import { withMessagingJobLock } from './messagingJobLock.service.js';
import { ensureDepartmentalSenderReady } from './departmentalSenderReadiness.service.js';
import { scopeDepartmentalStaff } from './departmentalGroupAccess.service.js';

const normalize = value => String(value || '').trim().toLowerCase();
const relay = 'ai@plottwistco.com';
const status = e => Number(e?.code || e?.response?.status);
const manager = m => ['OWNER','MANAGER'].includes(m?.role);
const addresses = row => [...new Set([...(row.mailbox_emails || '').split(','),row.email,row.work_email].map(normalize))].filter(e => e.includes('@'));

let departmentalSyncTimer = null;
const pendingDepartmentalAgencies = new Set();
/** Retryable background work: app permissions change immediately; Google is a mirror. */
export async function queueDepartmentalGroupMembershipSync({ userId = null, agencyIds = [] } = {}) {
  for (const id of agencyIds) if (Number(id)) pendingDepartmentalAgencies.add(Number(id));
  if (Number(userId)) {
    const [memberships] = await pool.execute('SELECT agency_id FROM user_agencies WHERE user_id=?', [userId]);
    for (const row of memberships) pendingDepartmentalAgencies.add(Number(row.agency_id));
  }
  if (!pendingDepartmentalAgencies.size || departmentalSyncTimer) return;
  departmentalSyncTimer = setTimeout(async () => {
    departmentalSyncTimer = null;
    const ids = [...pendingDepartmentalAgencies];
    pendingDepartmentalAgencies.clear();
    try {
      const report = await withMessagingJobLock('staff-membership', () => reconcileManagedWorkspaceGroups({
        apply: true, enrolledOnly: true, agencyIds: ids, groupKeys: Object.keys(DEPARTMENTAL_GROUPS)
      }));
      if (Array.isArray(report) && report.some(r => r.error || r.groups.some(g => g.error))) console.warn('[departmental-groups] Membership sync needs review; the recurring sync will retry.');
    } catch (error) { console.warn('[departmental-groups] Membership sync deferred:', error.message); }
  }, 500);
  departmentalSyncTimer.unref?.();
}
export async function loadManagedWorkspaceRoster(agencyId) {
  const [rows] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.work_email,u.personal_email,u.role,u.status,u.is_active,u.is_archived,
    u.is_demo,u.is_assistant_account,u.languages_spoken,u.has_hiring_access,u.has_medical_records_release_access,
    (SELECT public_details_json FROM provider_public_profiles WHERE user_id=u.id) AS public_details_json,
    (SELECT GROUP_CONCAT(v.value) FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE v.user_id=u.id AND d.field_key IN ('languages_spoken','provider_languages_spoken')) AS recorded_languages,
    u.credential,u.has_supervisor_privileges,u.sees_clients,u.has_provider_access,u.work_location,u.login_is_group_email,
    EXISTS(SELECT 1 FROM client_provider_assignments cpa JOIN clients c ON c.id=cpa.client_id WHERE cpa.provider_user_id=u.id AND c.agency_id=ua.agency_id AND cpa.is_active=1) AS has_client_assignments,
    EXISTS(SELECT 1 FROM agencies school WHERE school.organization_type='school' AND COALESCE(school.is_archived,0)=0
      AND (school.is_active=1 OR JSON_UNQUOTE(JSON_EXTRACT(school.feature_flags,'$.schoolOnboardingDraft'))='true')
      AND (EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.agency_id=ua.agency_id AND oa.organization_id=school.id AND oa.is_active=1)
        OR EXISTS(SELECT 1 FROM agency_schools ags WHERE ags.agency_id=ua.agency_id AND ags.school_organization_id=school.id AND ags.is_active=1))
      AND (EXISTS(SELECT 1 FROM user_agencies school_ua WHERE school_ua.user_id=u.id AND school_ua.agency_id=school.id AND school_ua.is_active=1)
        OR EXISTS(SELECT 1 FROM provider_school_assignments psa WHERE psa.provider_user_id=u.id AND psa.school_organization_id=school.id AND psa.is_active=1))
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','facilitator','clinician','qbha') OR u.has_provider_access=1)
    ) AS has_school_assignments,
    ua.is_active AS membership_active,ua.agency_role,ua.agency_position,ua.supervision_is_prelicensed,
    ua.has_payroll_access,ua.has_billing_access,ua.can_manage_credentialing,
    (SELECT GROUP_CONCAT(DISTINCT i.from_email) FROM communication_inboxes i
      WHERE i.owner_user_id=u.id AND i.agency_id=ua.agency_id AND i.kind='personal') AS mailbox_emails
    FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.agency_id=?`, [agencyId]);
  const [assignments] = await pool.execute('SELECT supervisor_id,supervisee_id FROM supervisor_assignments WHERE agency_id=?', [agencyId]);
  const [locations] = await pool.execute(`SELECT DISTINCT ul.user_id,ol.city,ol.state FROM user_office_locations ul
    JOIN office_locations ol ON ol.id=ul.office_location_id AND ol.is_active=1
    WHERE ul.is_active=1 AND (ol.agency_id=? OR EXISTS (SELECT 1 FROM office_location_agencies ola WHERE ola.office_location_id=ol.id AND ola.agency_id=?))`, [agencyId,agencyId]);
  for (let index=0;index<rows.length;index++) {
    // Retain inactive/nonstaff rows to identify obsolete members, without
    // loading agency permission profiles for hundreds of school/guardian users.
    const row=activeManagedStaff(rows[index]) ? await scopeDepartmentalStaff(rows[index],agencyId) : rows[index];
    rows[index]=row;
    row.locations = locations.filter(loc => Number(loc.user_id) === Number(row.id));
    Object.assign(row, scopeProviderRow(row, agencyId, row.public_details_json));
  }
  return { rows, assignments };
}

export async function retryNewGroupPropagation(work, enabled) {
  for(let attempt=0;;attempt++) {
    try {return await work();}
    catch(e) {if(!enabled || status(e)!==404 || attempt>=5)throw e;await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
  }
}

async function lookupGroup(admin, email) {
  try { return (await admin.groups.get({ groupKey: email })).data; }
  catch (e) { if (status(e) === 404) return null; throw e; }
}
async function lookupUser(admin, email) {
  try { return (await admin.users.get({ userKey: email })).data; }
  catch (e) { if (status(e) === 404 || (status(e) === 400 && /Type not supported: userKey/.test(e.message))) return null; throw e; }
}
async function memberDetails(admin, groupEmail, email) {
  try { return (await admin.members.get({ groupKey: groupEmail, memberKey: email })).data; }
  catch (e) { if (status(e) === 404) return null; throw e; }
}
export async function ensureManagedAppGroup({ agencyId, plan, userIds, managerUserIds, memberEmails }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute(`INSERT INTO managed_workspace_groups (agency_id,group_key,email,label)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label)`, [agencyId,plan.key,plan.email,plan.label]);
    const [[group]] = await db.execute('SELECT * FROM managed_workspace_groups WHERE agency_id=? AND group_key=? FOR UPDATE', [agencyId,plan.key]);
    let contactId=group.contact_id, threadId=group.chat_thread_id, meetingId=group.meeting_group_id;
    if (!contactId) {
      const [result] = await db.execute(`INSERT INTO agency_contacts
        (agency_id,full_name,email,share_with_all,source,source_ref_id,relationship_type,is_active)
        VALUES (?,?,?,1,'manual',?,'managed_workspace_group',1)`, [agencyId,`${plan.label} (group)`,plan.email,group.id]);
      contactId=result.insertId;
    }
    if (!threadId) {
      const [result] = await db.execute(`INSERT INTO chat_threads
        (agency_id,thread_type,name,slug,description,visibility,membership_rule)
        VALUES (?,'channel',?,?,?,'private','managed_workspace_group')`, [agencyId,plan.label,`workspace-${plan.key.replace(':','-')}`,`Chat with ${plan.label}. Messages stay in the app. Email the group separately at ${plan.email}.`]);
      threadId=result.insertId;
    }
    if (!meetingId) {
      const [result] = await db.execute('INSERT INTO agency_meeting_invite_groups (agency_id,name) VALUES (?,?)', [agencyId,`${plan.label} · ${plan.email}`]);
      meetingId=result.insertId;
    }
    // Members receive internal messages. Managers can contact the group even if
    // their own employment category differs from its audience.
    const ids=[...new Set([...userIds,...managerUserIds].map(Number))];
    const [existing] = await db.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id=?', [threadId]);
    for (const r of existing) if (!ids.includes(Number(r.user_id))) await db.execute('DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id=?', [threadId,r.user_id]);
    for (const id of ids) await db.execute('INSERT IGNORE INTO chat_thread_participants (thread_id,user_id) VALUES (?,?)', [threadId,id]);
    // Meeting selection uses the audience, not service/relay accounts.
    await db.execute('DELETE FROM agency_meeting_invite_group_members WHERE group_id=?', [meetingId]);
    for (const id of userIds) await db.execute('INSERT IGNORE INTO agency_meeting_invite_group_members (group_id,user_id) VALUES (?,?)', [meetingId,id]);
    await db.execute(`UPDATE managed_workspace_groups SET contact_id=?,chat_thread_id=?,meeting_group_id=?,manager_user_ids=?,member_emails=?,last_synced_at=NOW() WHERE id=?`, [contactId,threadId,meetingId,JSON.stringify(managerUserIds),JSON.stringify(memberEmails),group.id]);
    await db.commit();
    return { contactId,threadId,meetingId };
  } catch(e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
export async function reconcileManagedWorkspaceGroups({ apply=false, agencyIds=null, createMissingOnly=false, enrolledOnly=false, createdGroupEmails=[],groupKeys=null }={}) {
  if (!Directory.isConfigured()) return { skipped:'directory_not_configured' };
  const [agencies] = await pool.execute("SELECT id,name,slug,organization_type,is_active,feature_flags FROM agencies WHERE is_active=1 AND organization_type='agency'");
  const [identities] = await pool.execute(`SELECT esi.* FROM email_sender_identities esi
    WHERE esi.is_active=1 AND NOT EXISTS (SELECT 1 FROM communication_inboxes i
      WHERE i.sender_identity_id=esi.id AND (i.kind='personal' OR i.owner_user_id IS NOT NULL))`);
  const departmentalIdentities = new Map();
  for (const identity of identities) {
    const key = groupKeyForIdentity(identity);
    if (!key) continue;
    if (!departmentalIdentities.has(Number(identity.agency_id))) departmentalIdentities.set(Number(identity.agency_id), new Map());
    const configured = departmentalIdentities.get(Number(identity.agency_id));
    // Conflicting senders for a department require review before changing Google.
    const email = normalize(identity.from_email);
    configured.set(key, configured.has(key) && configured.get(key) !== email ? null : email);
  }
  const departmentDomain = agency => {
    const flags = typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags||'{}'):agency.feature_flags||{};
    const domain = normalize(flags.workspaceEmailDomain || CURRENT_MANAGED_DOMAINS[agency.slug]);
    const configured = departmentalIdentities.get(Number(agency.id));
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && [...(configured?.values() || [])].some(email=>email?.endsWith(`@${domain}`)) ? domain : null;
  };
  const tenantDomain = agency => managedDomain(agency) || departmentDomain(agency);
  const explicitlyEnrolled = agency => {
    const flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags||'{}'):agency.feature_flags||{};
    return flags.managedWorkspaceGroupsEnabled===true || !!managedGroupScope(agency)?.length;
  };
  const tenants=agencies.filter(a => {
    return tenantDomain(a) && (!enrolledOnly || explicitlyEnrolled(a) || departmentDomain(a)) && (!agencyIds || agencyIds.includes(Number(a.id)));
  });
  const domainOwners = new Map();
  for (const a of tenants) { const d=tenantDomain(a); if(domainOwners.has(d)) throw new Error(`Multiple managed tenants claim ${d}; resolve before syncing`); domainOwners.set(d,a.id); }
  const domains=new Set([...Object.values(CURRENT_MANAGED_DOMAINS), ...tenants.map(tenantDomain)]);
  const admin=await Directory.getClient();
  const reports=[];
  for (const agency of tenants) {
    const report={ agencyId:agency.id,domain:tenantDomain(agency),groups:[],missingMailbox:[],unclassified:[],error:null };
    reports.push(report);
    try {
      const {rows,assignments}=await loadManagedWorkspaceRoster(agency.id);
      const [stored]=await pool.execute('SELECT group_key,email,member_emails FROM managed_workspace_groups WHERE agency_id=?', [agency.id]);
      const scope=managedGroupScope(agency);
      const plans=buildManagedGroupPlan({domain:report.domain,rows,assignments,includeClinical:scope?.includes('clinical') || stored.some(g=>g.group_key==='clinical') || groupKeys?.includes('clinical'),includeSchoolProviders:scope?.includes('schoolproviders') || stored.some(g=>g.group_key==='schoolproviders') || groupKeys?.includes('schoolproviders')});
      for(const p of plans) p.email=stored.find(s=>s.group_key===p.key)?.email || p.email;
      const configuredDepartments = departmentalIdentities.get(Number(agency.id)) || new Map();
      for (const p of plans.filter(p=>p.ticketed)) p.email=configuredDepartments.get(p.key) || p.email;
      // Keep former supervisors' groups reconciled to empty after reassignment.
      for(const old of stored) if(!plans.some(p=>p.key===old.group_key)) plans.push({key:old.group_key,email:old.email,label:old.email.split('@')[0],userIds:[],managerUserIds:[]});
      const verified=new Map(), canonical=new Map(), selected=new Map(), known=new Map();
      for(const row of rows) for(const address of [...new Set([...addresses(row),normalize(row.personal_email)].filter(Boolean))]) {
        if(!known.has(address))known.set(address,[]);known.get(address).push(row);
      }
      for(const row of rows.filter(activeManagedStaff)) {
        const candidates=addresses(row).filter(e=>domains.has(e.split('@')[1]));
        if(Number(row.login_is_group_email)) candidates.sort((a,b)=>Number(b===normalize(row.email))-Number(a===normalize(row.email)));
        for(const email of candidates) {
          if(known.get(email).filter(activeManagedStaff).length !== 1) continue;
          if(!verified.has(email)) {
            const user=await lookupUser(admin,email);
            const group=user ? null : await lookupGroup(admin,email);
            verified.set(email,user ? 'USER' : group ? 'GROUP' : null);
            canonical.set(email,normalize(user?.primaryEmail || group?.email || email));
          }
          if(verified.get(email)) { selected.set(Number(row.id),email); break; }
        }
        if(!selected.has(Number(row.id))) report.missingMailbox.push(row.id);
        if(!plans.some(p=>['interns','unlicensed','prelicensed','licensed'].includes(p.key) && p.userIds.includes(Number(row.id))) && ['provider','provider_plus','intern','intern_plus'].includes(row.role)) report.unclassified.push(row.id);
      }
      for(const plan of plans) {
        // People Operations remains outside this rollout, including any older
        // manually managed entry. Do not change its membership or delivery.
        if (['po','people_operations','peopleoperations'].includes(plan.key)) continue;
        if(plan.ticketed && (!configuredDepartments.get(plan.key)?.endsWith(`@${report.domain}`)))continue;
        if(!plan.ticketed && enrolledOnly && !explicitlyEnrolled(agency))continue;
        if(!plan.ticketed && !managedDomain(agency))continue;
        if(scope?.length && !scope.includes(plan.key) && !plan.ticketed)continue;
        if(groupKeys&&!groupKeys.includes(plan.key))continue;
        if(plan.key.startsWith('supervisor:') && !selected.has(Number(plan.key.split(':')[1])) && !stored.some(g=>g.group_key===plan.key)) continue;
        const result={email:plan.email,groupKey:plan.key,subscription:plan.ticketed?'NONE':'ALL_MAIL',created:false,aiRole:null,added:[],removed:[],preserved:[],error:null};report.groups.push(result);
        try {
          let group=await lookupGroup(admin,plan.email);
          const isNew=!group || createdGroupEmails.includes(plan.email);
          if(createMissingOnly && !isNew) { result.skipped='existing_group_unchanged';continue; }
          if(!group) {
            if(await lookupUser(admin,plan.email)) throw new Error('Address belongs to a Workspace user; group not created');
            if(!apply) {result.created=true;result.added=plan.userIds.map(id=>selected.get(id)).filter(Boolean);continue;}
            group=await Directory.createGroup({email:plan.email,name:plan.label,description:plan.ticketed?'App-managed departmental ticket mailbox. Staff membership follows agency permissions; staff delivery is disabled.':'Managed staff distribution group. Membership follows current staff records.'});
            result.created=true;
          }
          const write = work => retryNewGroupPropagation(work,isNew);
          const members=await Directory.listGroupMembers(plan.email,{maxResults:10000,client:admin});
          // Directory lists primary addresses even when an alias was added.
          // Compare the actual account to its selected tenant mailbox so a sync
          // never removes a desired member just because Google returned an alias.
          const preferred=new Map([...selected.values()].map(email=>[canonical.get(email)||email,email]));
          const current=new Map(members.map(m=>[preferred.get(normalize(m.email))||normalize(m.email),m]));
          result.aiRole=current.get(relay)?.role || 'ABSENT';
          if (plan.ticketed && apply) {
            // Departmental delivery belongs to the app transport. Owners keep
            // membership with no email; the relay continues to ingest replies.
            for (const email of [APP_GROUP_OWNER, relay]) {
              const member = await write(()=>ensureAppGroupMember({admin,groupKey:plan.email,email}));
              current.set(email,member);
            }
            result.aiRole=current.get(relay).role;
          }
          // Clinical group management was explicitly enrolled by the owner.
          if(['clinical','schoolproviders'].includes(plan.key) && apply) {
            const member=await write(()=>ensureAppGroupMember({admin,groupKey:plan.email,email:relay}));
            current.set(relay,member);result.aiRole=member.role;
          }
          // Existing groups lacking the relay manager are reported for the owner
          // to grant access, as requested. Do not self-promote existing roles.
          if(isNew && apply && !['clinical','schoolproviders'].includes(plan.key) && !plan.ticketed) {
            await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:relay,role:'MANAGER',client:admin,memberType:'USER'}));
            await write(()=>Directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:relay,deliverySettings:'ALL_MAIL',client:admin}));
            current.set(relay,{email:relay,role:'MANAGER'});result.aiRole='MANAGER';
          }
          if(apply && (!scope?.length || isNew || plan.ticketed)) await write(()=>Directory.applyGroupAccessSettings({groupEmail:plan.email,whoCanJoin:'INVITED_CAN_JOIN',whoCanPostMessage:plan.ticketed?'ANYONE_CAN_POST':plan.key==='spanish'?'ALL_IN_DOMAIN_CAN_POST':'ALL_MANAGERS_CAN_POST',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',allowExternalMembers:true,...(plan.key==='spanish'?{membersCanPostAsTheGroup:true}:{})}));
          let ownerEmail=plan.key==='spanish'?APP_GROUP_OWNER:null;
          if(plan.key==='spanish'&&apply){
            // Application group ownership is independent of tenant employment.
            // Use the same verified account as all other managed groups; matching
            // a display name in this tenant's roster can miss the platform owner
            // or select a different person with the same name.
            const owner=await lookupUser(admin,APP_GROUP_OWNER);
            if(!owner || owner.suspended || owner.archived)throw new Error(`Spanish group owner ${APP_GROUP_OWNER} is unavailable in Google Workspace`);
            ownerEmail=normalize(owner.primaryEmail || APP_GROUP_OWNER);
            await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:ownerEmail,role:'OWNER',client:admin,memberType:'USER'}));
            current.set(ownerEmail,{email:ownerEmail,role:'OWNER'});
            const alias=`espanol@${report.domain}`;
            const aliases=(await admin.groups.aliases.list({groupKey:plan.email})).data.aliases||[];
            if(!aliases.some(a=>a.alias===alias))await write(()=>admin.groups.aliases.insert({groupKey:plan.email,requestBody:{alias}}));
            const support=`support@${report.domain}`;
            const supportGroup=await lookupGroup(admin,support),supportUser=supportGroup?null:await lookupUser(admin,support);
            if(!supportGroup&&!supportUser)throw new Error('Support address must exist before completing the Spanish group');
            if(!current.has(support)){await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:support,client:admin,memberType:supportGroup?'GROUP':'USER'}));current.set(support,{email:support,role:'MEMBER'});}
            // Add Support's verified users to the app channel as well. A nested
            // Google Group is not itself an app user or a client-care assignment.
            const supportMembers=supportGroup?await Directory.listGroupMembers(support,{maxResults:10000,client:admin}):[{email:supportUser.primaryEmail}];
            const supportEmails=new Set(supportMembers.map(m=>normalize(m.email)));
            for(const [id,email] of selected)if(supportEmails.has(email)||supportEmails.has(canonical.get(email)))plan.userIds.push(id);
            plan.userIds=[...new Set(plan.userIds)];

          }
          const desired=new Set(plan.userIds.map(id=>selected.get(id)).filter(Boolean));
          const managerIds=new Set(plan.managerUserIds || []);
          if(plan.key==='schoolproviders') for(const row of known.get(APP_GROUP_OWNER) || []) {
            if(activeManagedStaff(row))managerIds.add(Number(row.id));
          }
          if(isNew && !plan.ticketed) {
            for(const row of rows.filter(r=>activeManagedStaff(r) && ['admin','super_admin'].includes(r.role))) managerIds.add(Number(row.id));
            for(const id of managerIds) {
              const email=selected.get(id);
              if(email && verified.get(email)==='USER' && email!==ownerEmail) {
                if(apply) await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:email,role:'MANAGER',client:admin,memberType:verified.get(email)}));
                current.set(email,{email,role:'MANAGER'});
              }
            }
          }
          for(const email of desired) {
            if(!current.has(email)) {
              if(apply) await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:email,client:admin,memberType:verified.get(email),...(plan.ticketed?{deliverySettings:'NONE'}:{})}));
              result.added.push(email);current.set(email,{email,role:'MEMBER'});
            }
            if(apply) {
              const detail=await memberDetails(admin,plan.email,email);
              const delivery=plan.ticketed || email===ownerEmail?'NONE':'ALL_MAIL';
              if(detail?.delivery_settings!==delivery) await write(()=>Directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:email,deliverySettings:delivery,client:admin}));
            }
          }
          let owners=[...current.values()].filter(m=>m.role==='OWNER').length;
          const priorMemberEmails = stored.find(group=>group.group_key===plan.key)?.member_emails || [];
          const previouslyManaged = new Set((typeof priorMemberEmails==='string'?JSON.parse(priorMemberEmails):priorMemberEmails).map(normalize));
          for(const [email,m] of current) {
            if(email===APP_GROUP_OWNER || email===relay || desired.has(email) || plan.key==='spanish'&&email===`support@${report.domain}`) continue;
            if(createMissingOnly) {result.preserved.push(email);continue;}
            const people=known.get(email);
            if(!people?.length && !(plan.ticketed && previouslyManaged.has(email))) {result.preserved.push(email);continue;}
            // Scoped enrollment adds the requested audience without silently
            // removing current employees whose care/demo flags need review.
            if(scope?.length && plan.key==='clinical' && people.some(r=>Number(r.is_active)===1 && !Number(r.is_archived) && Number(r.membership_active)===1 && ['ACTIVE_EMPLOYEE','ACTIVE','ONBOARDING'].includes(String(r.status || '').toUpperCase()))) {result.preserved.push(email);continue;}
            const active=(people || []).filter(activeManagedStaff);
            if(!plan.ticketed && manager(m) && active.length && domains.has(email.split('@')[1])) continue;
            if(active.length && ['costaff','denver','cosprings'].includes(plan.key) && active.some(r=>!r.locations.length && !r.work_location)) {result.preserved.push(email);continue;}
            // Unknown credentials require review; do not erase a manually
            // maintained license classification because a field is blank.
            if(active.length && ['licensed','prelicensed','unlicensed','interns'].includes(plan.key) && active.some(r=>report.unclassified.includes(r.id))) {result.preserved.push(email);continue;}
            if(m.role==='OWNER' && owners<=1) {result.preserved.push(email);continue;}
            if(apply) await Directory.removeGroupMember({groupEmail:plan.email,memberEmail:email,client:admin});
            if(m.role==='OWNER')owners--;current.delete(email);result.removed.push(email);
          }
          if (plan.ticketed && apply) for (const [email] of current) {
            if (email===relay || desired.has(email)) continue;
            const detail=await memberDetails(admin,plan.email,email);
            if(detail?.delivery_settings!=='NONE') await write(()=>Directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:email,deliverySettings:'NONE',client:admin}));
          }
          for(const [email,m] of current) if(manager(m)) for(const row of known.get(email)||[]) if(activeManagedStaff(row) && (!plan.ticketed || plan.userIds.includes(Number(row.id))))managerIds.add(Number(row.id));
          if(plan.key==='spanish')for(const id of plan.userIds)managerIds.add(id);
          const appIds=new Set(plan.userIds);
          if(!plan.ticketed) for(const [email] of current) for(const row of known.get(email)||[]) if(activeManagedStaff(row))appIds.add(Number(row.id));
          if(apply) result.app=await ensureManagedAppGroup({agencyId:agency.id,plan,userIds:[...appIds],memberEmails:[...current.keys()].filter(e=>e!==relay && e!==ownerEmail && domains.has(e.split('@')[1]) && (known.get(e)||[]).some(activeManagedStaff)),managerUserIds:[...managerIds].filter(id=>rows.some(r=>Number(r.id)===id && activeManagedStaff(r)))});
          if (plan.ticketed && apply) result.sender = await ensureDepartmentalSenderReady({ email: plan.email, displayName: plan.label });
        } catch(e) {result.error=String(e.message).slice(0,240);}
      }
      if(apply && !createMissingOnly && !groupKeys && !scope?.length && managedDomain(agency) && (!enrolledOnly || explicitlyEnrolled(agency))) for(const [id,email] of selected) {
        const row=rows.find(r=>Number(r.id)===id);
        if(!(row.mailbox_emails || '').split(',').map(normalize).includes(email)) await ensurePersonalMailboxForAddress({agencyId:agency.id,userId:id,fromEmail:email});
      }
    } catch(e) {report.error=String(e.message).slice(0,240);}
  }
  return reports;
}
