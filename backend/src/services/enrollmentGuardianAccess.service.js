import pool from '../config/database.js';
import { enrollmentGuardianAccess } from '../utils/enrollmentGuardianAccess.js';
import { guardianClientPrivacy } from './guardianClientPrivacy.service.js';

export async function completedGuardianAccess({ clientId, guardianUserId, link, relationshipType = link?.relationship_type, permissions }, db = pool) {
  const privacyProtected = relationshipType !== 'self'
    && await guardianClientPrivacy({ clientId, guardianUserId }, db);
  return { ...enrollmentGuardianAccess(link, { confirmed: true, permissions, privacyProtected }), expectedLink: link || null };
}
