import pool from '../config/database.js';

import { isSchoolEmailType } from './schoolCareBridgeEmail.service.js';
const sharedTypes = new Set(['password_reset','admin_initiated_password_reset','invitation','guardian_portal_login_info','intake','intake_packet_completion','intake_summary_pdf_copy','co_guardian_invite','client_assigned','client_terminated','client_checklist_updated','client_renewal','enrollment_unfinished_reminder','enrollment_unfinished_reminder_24h','enrollment_unfinished_reminder_72h','enrollment_unfinished_reminder_7d']);
export async function isSchoolCommunication({templateType,schoolOrganizationId,clientId,userId,agencyId}) {
  if (isSchoolEmailType(templateType)) return true;
  if (!sharedTypes.has(String(templateType || '').toLowerCase())) return false;
  if (schoolOrganizationId) {
    const [rows] = await pool.execute("SELECT id FROM agencies WHERE id=? AND organization_type='school'",[schoolOrganizationId]);
    if (rows.length) return true;
  }
  if (clientId) {
    const [rows] = await pool.execute("SELECT c.id FROM clients c LEFT JOIN agencies a ON a.id=c.organization_id WHERE c.id=? AND (a.organization_type='school' OR c.client_type='school')",[clientId]);
    return rows.length>0;
  }
  if (userId) {
    const [rows] = await pool.execute("SELECT id FROM users WHERE id=? AND role='school_staff'",[userId]);
    if (rows.length) return true;
  }
  if (agencyId) {
    const [rows] = await pool.execute("SELECT id FROM agencies WHERE id=? AND organization_type='school'",[agencyId]);
    return rows.length>0;
  }
  return false;
}
