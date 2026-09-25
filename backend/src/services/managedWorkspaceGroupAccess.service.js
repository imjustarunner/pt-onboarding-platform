import pool from '../config/database.js';
import { activeManagedStaff, managedDomain } from './managedWorkspaceGroupPolicy.js';
const emails = value => (Array.isArray(value) ? value : [value]).flatMap(v => String(v || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(e => e.toLowerCase());
const json = value => typeof value === 'string' ? JSON.parse(value || '[]') : value || [];
async function findGroups(where, params) {
  try { const [rows] = await pool.execute(`SELECT g.*,a.is_active,a.organization_type,a.slug,a.feature_flags FROM managed_workspace_groups g JOIN agencies a ON a.id=g.agency_id WHERE ${where}`,params); return rows || []; }
  catch(e) { if(e.code==='ER_NO_SUCH_TABLE')return []; throw e; }
}
export async function assertManagedGroupManager(group, userId) {
  if(!managedDomain(group) || !userId || !json(group.manager_user_ids).map(Number).includes(Number(userId))) throw Object.assign(new Error('Only this group’s managers can contact its members.'),{status:403,code:'GROUP_MANAGER_REQUIRED'});
  const [[row]] = await pool.execute(`SELECT u.*,ua.is_active AS membership_active FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=?`,[userId,group.agency_id]);
  if(!row || !activeManagedStaff(row)) throw Object.assign(new Error('Active staff membership is required to contact this group.'),{status:403,code:'GROUP_MANAGER_REQUIRED'});
}
export async function assertManagedChatPost(threadId,userId) {
  const groups=await findGroups('g.chat_thread_id=?',[threadId]);
  if(groups[0]) await assertManagedGroupManager(groups[0],userId);
}
export async function assertManagedMeetingGroupEditable(groupId) {
  if((await findGroups('g.meeting_group_id=?',[groupId])).length) throw Object.assign(new Error('This group is managed automatically from staff records. Update staff credentials, work locations, or supervision assignments instead.'),{status:409});
}
/** Google cannot assign manager privileges to a nested Group (including
 * messages@). Authorized app managers therefore deliver to member mailboxes,
 * using Bcc to keep the distribution roster private. Personal Group mailboxes
 * remain intact so their existing inbound routing delivers to the app.
 */
export async function managedGroupEnvelope({to,cc=null,bcc=null,actorUserId}) {
  const targets=[...new Set([...emails(to),...emails(cc),...emails(bcc)])];
  if(!targets.length)return {to,cc,bcc};
  const groups=await findGroups(`LOWER(g.email) IN (${targets.map(()=>'?').join(',')})`,targets);
  if(!groups.length)return {to,cc,bcc};
  const expanded=new Set(),groupEmails=new Set();
  for(const group of groups) {
    await assertManagedGroupManager(group,actorUserId);
    groupEmails.add(String(group.email).toLowerCase());
    for(const address of json(group.member_emails)) expanded.add(String(address).toLowerCase());
  }
  const keptTo=emails(to).filter(e=>!groupEmails.has(e)),keptCc=emails(cc).filter(e=>!groupEmails.has(e));
  const hidden=[...new Set([...emails(bcc).filter(e=>!groupEmails.has(e)),...expanded])].filter(e=>!keptTo.includes(e)&&!keptCc.includes(e));
  if(!keptTo.length&&!keptCc.length&&!hidden.length)throw Object.assign(new Error('This group has no deliverable staff mailboxes yet.'),{status:409,code:'GROUP_EMPTY'});
  return {to:keptTo.join(', '),cc:keptCc.join(', ')||null,bcc:hidden.join(', ')||null};
}

export async function managedChatPostingAllowed(threadId,userId) {
  try { await assertManagedChatPost(threadId,userId);return true; }
  catch(e) { if(e.code==='GROUP_MANAGER_REQUIRED')return false;throw e; }
}
export async function assertManagedMeetingInvite(groupIds,userId) {
  if(!groupIds.length)return;
  const groups=await findGroups(`g.meeting_group_id IN (${groupIds.map(()=>'?').join(',')})`,groupIds);
  for(const group of groups)await assertManagedGroupManager(group,userId);
}
