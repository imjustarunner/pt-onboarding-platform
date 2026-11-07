import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import {guardianCanReadIntakeDocuments} from '../utils/guardianDocumentAccess.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function defaultIssuer(args) {
  const { ensureIssuedRoiSigningLinkForClient } = await import('../controllers/clientSchoolRoiAccess.controller.js');
  return ensureIssuedRoiSigningLinkForClient(args);
}

/**
 * Opens the school release already stored on the child's record for a signed-in guardian.
 * A completed release is left untouched. The public key is for the portal form, not a new email.
 */
export async function openGuardianSchoolRelease({
  userId,
  clientId,
  preview = false,
  db = pool,
  loadLink = (args) => ClientGuardian.getLink(args),
  findExisting = (args) => ClientSchoolRoiSigningLink.findForClient(args),
  issueLink = defaultIssuer
} = {}) {
  if (preview) throw fail('Preview cannot open a school release.', 403);
  const cid = Number(clientId);
  const uid = Number(userId);
  if (!cid || !uid) throw fail('A child is required.', 400);

  const link = await loadLink({ clientId: cid, guardianUserId: uid });
  const enabled = Number(link?.access_enabled) === 1 || link?.access_enabled === true;
  if (!link || !enabled || !guardianCanReadIntakeDocuments(link)) {
    throw fail('This child’s record is not available on your account.', 403);
  }

  const [clients] = await db.execute(
    `SELECT c.id, c.organization_id, org.name AS organization_name, org.organization_type
       FROM clients c
       LEFT JOIN agencies org ON org.id = c.organization_id
      WHERE c.id = ?
      LIMIT 1`,
    [cid]
  );
  const client = clients?.[0];
  if (!client) throw fail('This child’s record is not available on your account.', 404);

  let schoolId = Number(client.organization_id || 0);
  let schoolName = String(client.organization_name || '').trim();
  if (String(client.organization_type || '').toLowerCase() !== 'school') {
    let schools = [];
    try {
      const [rows] = await db.execute(
        `SELECT a.id, a.name
           FROM client_organization_assignments coa
           JOIN agencies a ON a.id = coa.organization_id AND a.organization_type = 'school'
          WHERE coa.client_id = ? AND coa.is_active = 1
          ORDER BY coa.is_primary DESC, a.name
          LIMIT 1`,
        [cid]
      );
      schools = rows || [];
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
      schools = [];
    }
    const school = schools[0];
    if (!school) return { ready: false, reason: 'no_school', clientId: cid };
    schoolId = Number(school.id);
    schoolName = String(school.name || '').trim();
  }
  if (!schoolId) return { ready: false, reason: 'no_school', clientId: cid };

  const existing = await findExisting({ clientId: cid, schoolOrganizationId: schoolId });
  if (String(existing?.status || '').toLowerCase() === 'completed') {
    return {
      ready: false,
      status: 'completed',
      clientId: cid,
      schoolOrganizationId: schoolId,
      schoolName
    };
  }

  const issued = await issueLink({
    client: { id: cid },
    schoolOrganizationId: schoolId,
    actorUserId: uid,
    regenerate: false
  });
  const publicKey = String(issued?.issuedLink?.public_key || '').trim();
  if (!issued?.ok || !publicKey) {
    return {
      ready: false,
      reason: 'unavailable',
      clientId: cid,
      schoolOrganizationId: schoolId,
      schoolName
    };
  }

  const status = String(issued.issuedLink.status || 'issued').toLowerCase();
  return {
    ready: status !== 'completed',
    status,
    clientId: cid,
    schoolOrganizationId: schoolId,
    schoolName,
    publicKey
  };
}
