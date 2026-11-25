import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { FOUNDERS_GROUP_KEY, FOUNDERS_GROUPS, NEW_FOUNDERS_GROUPS } from './foundersGroupPolicy.js';
import { retryNewGroupPropagation } from './managedWorkspaceGroups.service.js';

const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const mailbox = value => String(value || '').trim().toLowerCase();

async function verifyFounder(name, address, directory) {
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(mailbox(address))) {
    throw new Error(`Supply the Workspace mailbox for ${name} Mendez.`);
  }
  const user = await directory.getUser({ primaryEmail: address });
  if (!user?.id || !user.primaryEmail || user.suspended || user.archived ||
      normalize(user.name?.givenName) !== normalize(name) || normalize(user.name?.familyName) !== 'mendez') {
    throw new Error(`The specified Workspace mailbox did not verify for ${name} Mendez.`);
  }
  return user;
}

function checkRoster(groupEmail, roster, founders) {
  if (roster.some(member => !founders.some(founder =>
    member.type === 'USER' && (member.id === founder.id || mailbox(member.email) === mailbox(founder.primaryEmail))))) {
    throw new Error(`${groupEmail} has other members. Review its roster before enabling hiring receipts.`);
  }
}

async function resolveAgency(db, slug, email) {
  const [rows] = await db.execute(
    "SELECT id FROM agencies WHERE slug=? AND is_active=1 AND COALESCE(is_archived,0)=0 AND organization_type='agency'", [slug]
  );
  if (rows.length !== 1) throw new Error(`Could not verify the agency for ${email}.`);
  const id = rows[0].id;
  const [existing] = await db.execute(
    'SELECT agency_id,group_key,email,contact_id,chat_thread_id,meeting_group_id FROM managed_workspace_groups WHERE (agency_id=? AND group_key=?) OR email=?',
    [id, FOUNDERS_GROUP_KEY, email]
  );
  if (existing.some(group => Number(group.agency_id) !== Number(id) || group.group_key !== FOUNDERS_GROUP_KEY
    || mailbox(group.email) !== email || group.contact_id || group.chat_thread_id || group.meeting_group_id)) {
    throw new Error(`Review the existing application group record for ${email} before registering this distribution group.`);
  }
  return id;
}

async function registerGroup(db, agencyId, email) {
  await db.execute(
    `INSERT INTO managed_workspace_groups (agency_id,group_key,email,label,last_synced_at)
     VALUES (?,?,?,'Founders',NOW()) ON DUPLICATE KEY UPDATE last_synced_at=
     IF(agency_id=VALUES(agency_id) AND group_key=VALUES(group_key) AND email=VALUES(email),NOW(),last_synced_at)`,
    [agencyId, FOUNDERS_GROUP_KEY, email]
  );
}

export async function provisionFoundersGroups({ melissa, michael, apply = false, directory = Directory, db = pool }) {
  const founders = await Promise.all([
    verifyFounder('Melissa', melissa, directory),
    verifyFounder('Michael', michael, directory)
  ]);
  if (founders[0].id === founders[1].id) throw new Error('The two founders need distinct Workspace accounts.');
  const admin = await directory.getClient();
  const plans = [];
  const existingItscoAddress = FOUNDERS_GROUPS.itsco;
  const itscoId = await resolveAgency(db, 'itsco', existingItscoAddress);
  const itscoGroup = await directory.getGroup({ groupEmail: existingItscoAddress, strictNotFound: true });
  if (mailbox(itscoGroup?.email) !== existingItscoAddress) {
    throw new Error('Verify the existing ITSCO Founders group before enabling hiring receipts.');
  }
  const agencies = new Map();
  // Check all three groups before making any changes.
  for (const email of NEW_FOUNDERS_GROUPS) {
    const slug = Object.keys(FOUNDERS_GROUPS).find(key => FOUNDERS_GROUPS[key] === email);
    agencies.set(email, await resolveAgency(db, slug, email));
    const group = await directory.getGroup({ groupEmail: email, strictNotFound: true });
    if (group && mailbox(group.email) !== email) throw new Error(`${email} is an alias of another group.`);
    if (!group && await directory.getUser({ primaryEmail: email })) {
      throw new Error(`${email} belongs to a Workspace user.`);
    }
    if (group) checkRoster(email, await directory.listGroupMembers(email, { client: admin }), founders);
    plans.push({ email, create: !group, ready: false });
  }
  if (!apply) return plans;
  for (const plan of plans) {
    const groupKey = plan.email;
    if (plan.create) {
      await admin.groups.insert({ requestBody: {
        email: groupKey, name: 'Founders', description: 'Private distribution group for company founders.'
      } });
    }
    const write = fn => retryNewGroupPropagation(fn, plan.create);
    await write(() => directory.applyGroupAccessSettings({
      groupEmail: groupKey,
      whoCanJoin: 'INVITED_CAN_JOIN',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST',
      includeInGlobalAddressList: false,
      allowExternalMembers: false
    }));
    for (const founder of [...founders].reverse()) {
      const email = mailbox(founder.primaryEmail);
      const role = founder === founders[1] ? 'OWNER' : 'MEMBER';
      await write(async () => {
        let member;
        try { member = (await admin.members.get({ groupKey, memberKey: email })).data; }
        catch (error) { if (Number(error.code || error.response?.status) !== 404) throw error; }
        if (!member) {
          await admin.members.insert({ groupKey, requestBody: { email, role, delivery_settings: 'ALL_MAIL' } });
        } else if (member.delivery_settings !== 'ALL_MAIL') {
          await admin.members.update({
            groupKey, memberKey: email, requestBody: { email, role: member.role, delivery_settings: 'ALL_MAIL' }
          });
        }
        const { data } = await admin.members.get({ groupKey, memberKey: email });
        if (data?.delivery_settings !== 'ALL_MAIL') throw new Error(`Could not verify founder delivery for ${groupKey}.`);
      });
    }
    const roster = await directory.listGroupMembers(groupKey, { client: admin });
    checkRoster(groupKey, roster, founders);
    if (roster.length !== founders.length) throw new Error(`Could not verify both founders on ${groupKey}.`);
    await registerGroup(db, agencies.get(groupKey), groupKey);
    plan.ready = true;
  }
  await registerGroup(db, itscoId, existingItscoAddress);
  return plans;
}
