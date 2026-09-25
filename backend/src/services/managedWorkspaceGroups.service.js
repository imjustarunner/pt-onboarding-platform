import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { managedDomain, activeManagedStaff, buildManagedGroupPlan, CURRENT_MANAGED_DOMAINS } from './managedWorkspaceGroupPolicy.js';
import { ensurePersonalMailboxForAddress } from './personalMailbox.service.js';

const normalize = value => String(value || '').trim().toLowerCase();
const relay = 'ai@plottwistco.com';
const status = e => Number(e?.code || e?.response?.status);
const manager = m => ['OWNER','MANAGER'].includes(m?.role);
const addresses = row => [...new Set([...(row.mailbox_emails || '').split(','),row.email,row.work_email].map(normalize))].filter(e => e.includes('@'));
export async function loadManagedWorkspaceRoster(agencyId) {
  const [rows] = await pool.execute(`SELECT u.id,u.first_name,u.email,u.work_email,u.personal_email,u.role,u.status,u.is_active,u.is_archived,
    u.is_demo,u.credential,u.has_supervisor_privileges,u.work_location,u.login_is_group_email,
    ua.is_active AS membership_active,ua.agency_position,ua.supervision_is_prelicensed,
    (SELECT GROUP_CONCAT(DISTINCT i.from_email) FROM communication_inboxes i
      WHERE i.owner_user_id=u.id AND i.agency_id=ua.agency_id AND i.kind='personal') AS mailbox_emails
    FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.agency_id=?`, [agencyId]);
  const [assignments] = await pool.execute('SELECT supervisor_id,supervisee_id FROM supervisor_assignments WHERE agency_id=?', [agencyId]);
  const [locations] = await pool.execute(`SELECT DISTINCT ul.user_id,ol.city,ol.state FROM user_office_locations ul
    JOIN office_locations ol ON ol.id=ul.office_location_id AND ol.is_active=1
    WHERE ul.is_active=1 AND (ol.agency_id=? OR EXISTS (SELECT 1 FROM office_location_agencies ola WHERE ola.office_location_id=ol.id AND ola.agency_id=?))`, [agencyId,agencyId]);
  for (const row of rows) row.locations = locations.filter(loc => Number(loc.user_id) === Number(row.id));
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
        VALUES (?,'channel',?,?,?,'private','managed_workspace_group')`, [agencyId,plan.label,`workspace-${plan.key.replace(':','-')}`,`${plan.email} · Email, internal messages and meeting invitees. SMS coming soon.`]);
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
export async function reconcileManagedWorkspaceGroups({ apply=false, agencyIds=null, createMissingOnly=false, enrolledOnly=false, createdGroupEmails=[] }={}) {
  if (!Directory.isConfigured()) return { skipped:'directory_not_configured' };
  const [agencies] = await pool.execute("SELECT id,name,slug,organization_type,is_active,feature_flags FROM agencies WHERE is_active=1 AND organization_type='agency'");
  const tenants=agencies.filter(a => {
    const flags=typeof a.feature_flags==='string'?JSON.parse(a.feature_flags||'{}'):a.feature_flags||{};
    return managedDomain(a) && (!enrolledOnly || flags.managedWorkspaceGroupsEnabled===true) && (!agencyIds || agencyIds.includes(Number(a.id)));
  });
  const domainOwners = new Map();
  for (const a of tenants) { const d=managedDomain(a); if(domainOwners.has(d)) throw new Error(`Multiple managed tenants claim ${d}; resolve before syncing`); domainOwners.set(d,a.id); }
  const domains=new Set([...Object.values(CURRENT_MANAGED_DOMAINS), ...tenants.map(managedDomain)]);
  const admin=await Directory.getClient();
  const reports=[];
  for (const agency of tenants) {
    const report={ agencyId:agency.id,domain:managedDomain(agency),groups:[],missingMailbox:[],unclassified:[],error:null };
    reports.push(report);
    try {
      const {rows,assignments}=await loadManagedWorkspaceRoster(agency.id);
      const plans=buildManagedGroupPlan({domain:report.domain,rows,assignments});
      const [stored]=await pool.execute('SELECT group_key,email FROM managed_workspace_groups WHERE agency_id=?', [agency.id]);
      for(const p of plans) p.email=stored.find(s=>s.group_key===p.key)?.email || p.email;
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
        if(plan.key.startsWith('supervisor:') && !selected.has(Number(plan.key.split(':')[1])) && !stored.some(g=>g.group_key===plan.key)) continue;
        const result={email:plan.email,created:false,aiRole:null,added:[],removed:[],preserved:[],error:null};report.groups.push(result);
        try {
          let group=await lookupGroup(admin,plan.email);
          const isNew=!group || createdGroupEmails.includes(plan.email);
          if(createMissingOnly && !isNew) { result.skipped='existing_group_unchanged';continue; }
          if(!group) {
            if(await lookupUser(admin,plan.email)) throw new Error('Address belongs to a Workspace user; group not created');
            if(!apply) {result.created=true;result.added=plan.userIds.map(id=>selected.get(id)).filter(Boolean);continue;}
            group=await Directory.createGroup({email:plan.email,name:plan.label,description:'Managed staff distribution group. Membership follows current staff records.'});
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
          // Existing groups lacking the relay manager are reported for the owner
          // to grant access, as requested. Do not self-promote existing roles.
          if(isNew && apply) {
            await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:relay,role:'MANAGER',client:admin,memberType:'USER'}));
            await write(()=>Directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:relay,deliverySettings:'ALL_MAIL',client:admin}));
            current.set(relay,{email:relay,role:'MANAGER'});result.aiRole='MANAGER';
          }
          if(apply) await write(()=>Directory.applyGroupAccessSettings({groupEmail:plan.email,whoCanJoin:'INVITED_CAN_JOIN',whoCanPostMessage:'ALL_MANAGERS_CAN_POST',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',allowExternalMembers:true}));
          const desired=new Set(plan.userIds.map(id=>selected.get(id)).filter(Boolean));
          const managerIds=new Set(plan.managerUserIds || []);
          if(isNew) {
            for(const row of rows.filter(r=>activeManagedStaff(r) && ['admin','super_admin'].includes(r.role))) managerIds.add(Number(row.id));
            for(const id of managerIds) {
              const email=selected.get(id);
              if(email && verified.get(email)==='USER') {
                if(apply) await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:email,role:'MANAGER',client:admin,memberType:verified.get(email)}));
                current.set(email,{email,role:'MANAGER'});
              }
            }
          }
          for(const email of desired) {
            if(!current.has(email)) {
              if(apply) await write(()=>Directory.addGroupMember({groupEmail:plan.email,memberEmail:email,client:admin,memberType:verified.get(email)}));
              result.added.push(email);current.set(email,{email,role:'MEMBER'});
            }
            if(apply) {
              const detail=await memberDetails(admin,plan.email,email);
              if(detail?.delivery_settings!=='ALL_MAIL') await write(()=>Directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:email,deliverySettings:'ALL_MAIL',client:admin}));
            }
          }
          let owners=[...current.values()].filter(m=>m.role==='OWNER').length;
          for(const [email,m] of current) {
            if(email===relay || desired.has(email)) continue;
            if(createMissingOnly) {result.preserved.push(email);continue;}
            const people=known.get(email);
            if(!people?.length) {result.preserved.push(email);continue;}
            const active=people.filter(activeManagedStaff);
            if(manager(m) && active.length && domains.has(email.split('@')[1])) continue;
            if(active.length && ['costaff','denver','cosprings'].includes(plan.key) && active.some(r=>!r.locations.length && !r.work_location)) {result.preserved.push(email);continue;}
            // Unknown credentials require review; do not erase a manually
            // maintained license classification because a field is blank.
            if(active.length && ['licensed','prelicensed','unlicensed','interns'].includes(plan.key) && active.some(r=>report.unclassified.includes(r.id))) {result.preserved.push(email);continue;}
            if(m.role==='OWNER' && owners<=1) {result.preserved.push(email);continue;}
            if(apply) await Directory.removeGroupMember({groupEmail:plan.email,memberEmail:email,client:admin});
            if(m.role==='OWNER')owners--;current.delete(email);result.removed.push(email);
          }
          for(const [email,m] of current) if(manager(m)) for(const row of known.get(email)||[]) if(activeManagedStaff(row))managerIds.add(Number(row.id));
          const appIds=new Set(plan.userIds);
          for(const [email] of current) for(const row of known.get(email)||[]) if(activeManagedStaff(row))appIds.add(Number(row.id));
          if(apply) result.app=await ensureManagedAppGroup({agencyId:agency.id,plan,userIds:[...appIds],memberEmails:[...current.keys()].filter(e=>e!==relay && domains.has(e.split('@')[1]) && (known.get(e)||[]).some(activeManagedStaff)),managerUserIds:[...managerIds].filter(id=>rows.some(r=>Number(r.id)===id && activeManagedStaff(r)))});
        } catch(e) {result.error=String(e.message).slice(0,240);}
      }
      if(apply && !createMissingOnly) for(const [id,email] of selected) {
        const row=rows.find(r=>Number(r.id)===id);
        if(!(row.mailbox_emails || '').split(',').map(normalize).includes(email)) await ensurePersonalMailboxForAddress({agencyId:agency.id,userId:id,fromEmail:email});
      }
    } catch(e) {report.error=String(e.message).slice(0,240);}
  }
  return reports;
}
