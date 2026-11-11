import crypto from 'node:crypto';
import pool from '../config/database.js';
import ActivityLogService from './activityLog.service.js';
import { FAMILY_COMMUNICATION_NOTICE, FAMILY_COMMUNICATION_POLICY_VERSION } from '../../../frontend/src/navigation/familyCommunicationPolicy.js';

const error = (status, message, code = 'FAMILY_SHARING_NOTICE_ACCESS') => Object.assign(new Error(message), { status, code });
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const hash = value => value ? crypto.createHash('sha256').update(String(value)).digest('hex') : null;

export function createSharedFamilyNotice({ db = pool, audit = data => ActivityLogService.logActivity(data) } = {}) {
  async function authorize({ userId, agencyId }) {
    userId = positive(userId); agencyId = positive(agencyId);
    if (!userId || !agencyId) throw error(400, 'Open an authorized workspace before reviewing this notice.');
    const [[user]] = await db.execute('SELECT id,role,status,is_active,is_archived,terminated_at FROM users WHERE id=?', [userId]);
    if (!user || Number(user.is_active) !== 1 || [true,1,'1'].includes(user.is_archived) || user.terminated_at
        || !['ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY'].includes(String(user.status || '').toUpperCase())) throw error(403, 'An active account is required.');
    const family = ['client','client_guardian'].includes(String(user.role).toLowerCase());
    const [[access]] = family
      ? await db.execute(`SELECT 1 AS allowed FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
          JOIN agencies a ON a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
          WHERE cg.guardian_user_id=? AND cg.access_enabled=1 AND (c.agency_id=a.id OR EXISTS
            (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=a.id AND ca.is_active=1)) LIMIT 1`, [agencyId,userId])
      : await db.execute(`SELECT 1 AS allowed FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
          WHERE ua.user_id=? AND ua.agency_id=? AND ua.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 LIMIT 1`, [userId,agencyId]);
    if (!access) throw error(403, 'Your access to this workspace has changed.');
    return { userId, agencyId };
  }
  async function read(input) {
    const scope = await authorize(input);
    const [[row]] = await db.execute('SELECT acknowledged_at FROM secure_family_communication_acknowledgments WHERE user_id=? AND agency_id=? AND policy_version=?', [scope.userId,scope.agencyId,FAMILY_COMMUNICATION_POLICY_VERSION]);
    return { version:FAMILY_COMMUNICATION_POLICY_VERSION, agencyId:scope.agencyId, acknowledged:!!row,
      acknowledgedAt:row?.acknowledged_at || null, notice:FAMILY_COMMUNICATION_NOTICE, grantsAccess:false };
  }
  async function requireAck(input) {
    const state = await read(input);
    if (!state.acknowledged) throw Object.assign(error(409, 'Please review who can see this communication and select I understand before sending.', 'FAMILY_SHARING_ACK_REQUIRED'), { agencyId:state.agencyId, version:state.version });
    return state;
  }
  async function acknowledge({ acknowledged, version, req, ...input }) {
    if (acknowledged !== true || version !== FAMILY_COMMUNICATION_POLICY_VERSION) throw error(400, 'Read and acknowledge the current communication notice.', 'FAMILY_SHARING_NOTICE_VERSION');
    const scope = await authorize(input);
    const [result] = await db.execute(`INSERT IGNORE INTO secure_family_communication_acknowledgments
      (user_id,agency_id,policy_version,ip_hash,user_agent_hash) VALUES (?,?,?,?,?)`,
    [scope.userId,scope.agencyId,FAMILY_COMMUNICATION_POLICY_VERSION,hash(req?.ip),hash(req?.headers?.['user-agent'])]);
    if (result.affectedRows) audit({ actionType:'family_communication_notice_acknowledged', userId:scope.userId, agencyId:scope.agencyId,
      metadata:{ policyVersion:FAMILY_COMMUNICATION_POLICY_VERSION, accessGranted:false } });
    return read(scope);
  }
  return { read, requireAck, acknowledge };
}
export const readSharedFamilyNotice = (input, db = pool) => createSharedFamilyNotice({db}).read(input);
export const requireSharedFamilyAck = (input, db = pool) => createSharedFamilyNotice({db}).requireAck(input);
export const acknowledgeSharedFamilyNotice = (input, db = pool) => createSharedFamilyNotice({db}).acknowledge(input);
