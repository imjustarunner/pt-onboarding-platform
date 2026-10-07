import crypto from 'node:crypto';
import pool from '../config/database.js';
import {normalizeSectionConfig} from '../constants/providerUpdateSections.js';
import {isStaffCommunicationRole} from '../utils/staffCommunicationChoices.js';

export const isProviderUpdatePreviewToken = token => /^preview_[a-f0-9]{48}$/i.test(String(token || '').trim());

// A separate draft and a short-lived token use the real recipient UI. No emails,
// tasks, consent, progress, payroll records or changes to the staff profile.
export async function createProviderUpdatePreviewLink({agencyId, providerUserId, createdByUserId = null, title, sectionConfig, attachedAdminUpdateId = null, sectionAudience = null, amendmentPlan = null}) {
  if (![agencyId,providerUserId].every(v=>Number.isSafeInteger(Number(v))&&Number(v)>0)) throw Object.assign(new Error('Choose an agency and staff member.'),{status:400});
  const db = await pool.getConnection();
  try {
    const [people] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE u.id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 LIMIT 1`,[providerUserId,agencyId]);
    const person = people[0];
    if (!person || !isStaffCommunicationRole(person.role)) throw Object.assign(new Error('Staff member not found in this agency.'),{status:404});
    if (attachedAdminUpdateId) {
      const [updates] = await db.execute('SELECT id FROM admin_updates WHERE id=? AND agency_id=? LIMIT 1',[attachedAdminUpdateId,agencyId]);
      if (!updates.length) throw Object.assign(new Error('Admin Update not found in this agency.'),{status:404});
    }
    const token = `preview_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now()+7*24*60*60*1000);
    await db.beginTransaction();
    const [push] = await db.execute(`INSERT INTO provider_update_pushes
      (agency_id,title,status,section_config_json,notes,created_by_user_id,attached_admin_update_id,section_audience_json,amendment_plan_json)
      VALUES (?,?,'draft',?,?,?,?,?,?)`,[agencyId,`[PREVIEW] ${String(title||'Provider Update').slice(0,245)}`,JSON.stringify(normalizeSectionConfig(sectionConfig)),
      'Read-only preview. No invitation sent. Create or use a separate sending draft for staff invitations.',createdByUserId,attachedAdminUpdateId,JSON.stringify(sectionAudience||{}),amendmentPlan?JSON.stringify(amendmentPlan):null]);
    const [recipient] = await db.execute(`INSERT INTO provider_update_recipients (push_id,agency_id,provider_user_id,token,expires_at,role_snapshot)
      VALUES (?,?,?,?,?,?)`,[push.insertId,agencyId,providerUserId,token,expiresAt,person.role]);
    await db.commit();
    return {previewOnly:true,pushId:push.insertId,recipientId:recipient.insertId,token,expiresAt,provider:person};
  } catch(e) {await db.rollback();throw e;} finally {db.release();}
}
