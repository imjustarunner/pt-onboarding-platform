import pool from '../config/database.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { isNluTutoringQaAgency } from '../utils/nluTutoringQaPolicy.js';

const fail = message => { throw Object.assign(new Error(message), {status:400}); };
const flags = value => { try { return typeof value==='string'?JSON.parse(value):value||{}; } catch { return {}; } };
function allowedMembership(user, aid, allowedAgencies) {
  if (user.agency_id == null || allowedAgencies.includes(Number(user.agency_id))) return true;
  // Existing school/office guardians belong to their portal organization, not
  // necessarily its clinical parent. Verify the retained synthetic organization
  // and its real affiliation; a testing address is not an isolation boundary.
  return aid===450 && [451,452].includes(Number(user.agency_id))
    && Number(user.root_affiliated)===1 && Number(user.membership_active)===1
    && !Number(user.membership_archived)
    && String(user.membership_slug||'').startsWith('auricwell-qa-demo-')
    && flags(user.membership_flags).qaSandbox?.syntheticOnly===true;
}
export async function validateQaIntakeGuardian({agencyId,email}, db=pool) {
  const aid=Number(agencyId);
  if (![450,453,454].includes(aid)) return false;
  const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?',[aid]);
  if (!(aid===450?isAuricwellQaAgency(agency):isNluTutoringQaAgency(agency))) fail('The QA organization is not configured for synthetic enrollment.');
  const allowedAgencies=aid===450?[450]:[453,454];
  const address=String(email||'').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+-]*@example\.com$/.test(address)
    && !/^testing\+[a-z0-9][a-z0-9._-]*@itsco\.health$/.test(address)) {
    fail('Use a unique synthetic @example.com identity or testing+family@itsco.health alias for each QA guardian. The shared testing@itsco.health inbox cannot be used as a guardian login.');
  }
  const [users]=await db.execute(`SELECT u.id,u.role,ua.agency_id,
      qa_member_org.slug AS membership_slug,qa_member_org.feature_flags AS membership_flags,
      qa_member_org.is_active AS membership_active,qa_member_org.is_archived AS membership_archived,
      EXISTS(SELECT 1 FROM organization_affiliations qa_affiliation
        WHERE qa_affiliation.organization_id=ua.agency_id AND qa_affiliation.agency_id=?
          AND qa_affiliation.is_active=1) AS root_affiliated
    FROM users u LEFT JOIN user_agencies ua ON ua.user_id=u.id
    LEFT JOIN agencies qa_member_org ON qa_member_org.id=ua.agency_id WHERE LOWER(u.email)=?`,[aid,address]);
  if (users.some(u=>!['client_guardian','client','guardian'].includes(u.role) || !allowedMembership(u,aid,allowedAgencies))) {
    fail('That account is not an isolated QA family. Choose a new @example.com identity.');
  }
  const userIds=[...new Set(users.map(u=>Number(u.id)))];
  if (userIds.length) {
    const [clients]=await db.execute(`SELECT cg.guardian_user_id,c.id,c.agency_id,c.is_demo
      FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
      WHERE cg.guardian_user_id IN (${userIds.map(()=>'?').join(',')})`,userIds);
    if (clients.some(client=>!allowedAgencies.includes(Number(client.agency_id)) || Number(client.is_demo)!==1)) {
      fail('That account is linked to a family outside this synthetic QA scope. Choose a separate QA identity.');
    }
  }
  return true;
}

export async function markQaIntakeGuardian({agencyId,userId,email},db=pool) {
  if (!await validateQaIntakeGuardian({agencyId,email},db)) return;
  // Membership is created by the normal enrollment flow before this marker.
  await db.execute(`UPDATE users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    SET u.is_demo=1 WHERE u.id=? AND LOWER(u.email)=? AND u.role IN ('client_guardian','client','guardian')`,[Number(agencyId),userId,String(email).trim().toLowerCase()]);
}
