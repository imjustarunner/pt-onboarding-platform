import {getProviderDisplayRole} from '../services/providerDisplayRole.service.js';
import pool from '../config/database.js';
import { employeeBusinessCardWorkLine } from '../services/businessCardContact.service.js';
import { resolveStaffSignatureContext } from '../services/staffHtmlEmailSignature.service.js';
import { CARD_STAFF_ROLES, canManageBusinessCards, normalizeBusinessCardSettings } from '../services/businessCardSettings.service.js';

const reject = (res, status, message) => res.status(status).json({ error: { message } });
const positiveId = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? Number(value) : null;
const activeStaff = user => user && CARD_STAFF_ROLES.includes(user.role) && ![0, false, '0'].includes(user.is_active) && ['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user.status || '').toUpperCase());

async function access(req, res) {
  const agencyId = positiveId(req.params.id);
  if (!agencyId) { reject(res, 400, 'Invalid organization.'); return null; }
  const [actors] = await pool.execute('SELECT id, role, status, is_active FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  const actor = actors[0];
  if (!activeStaff(actor)) { reject(res, 403, 'Business cards are available to active staff.'); return null; }
  if (actor.role !== 'super_admin') {
    const [memberships] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND COALESCE(is_active, TRUE) = TRUE LIMIT 1', [actor.id, agencyId]);
    if (!memberships.length) { reject(res, 403, 'You do not belong to this organization.'); return null; }
  }
  return { agencyId, actor, canManage: canManageBusinessCards(actor) };
}

export async function getBusinessCardTemplate(req, res, next) {
  try {
    const scope = await access(req, res); if (!scope) return;
    const [rows] = await pool.execute(`SELECT id, name, official_name, slug, organization_type, logo_url, logo_path, color_palette,
      website_url, phone_number, phone_extension, street_address, city, state, postal_code, feature_flags
      FROM agencies WHERE id = ? LIMIT 1`, [scope.agencyId]);
    if (!rows[0]) return reject(res, 404, 'Organization not found.');
    const { feature_flags, ...agency } = rows[0];
    let flags = feature_flags; if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
    const targetId = req.query.userId === undefined ? null : positiveId(req.query.userId);
    if (req.query.userId !== undefined && !targetId) return reject(res, 400, 'Invalid employee.');
    if (targetId && !scope.canManage && targetId !== scope.actor.id) return reject(res, 403, 'You can print only your own employee card.');
    const selfOnly = !scope.canManage || req.query.self === 'true';
    const onlyId = selfOnly ? scope.actor.id : targetId;
    const [people] = await pool.execute(`SELECT DISTINCT u.id, u.first_name, u.last_name, u.preferred_name, u.role, u.status, u.is_active, ua.agency_role, ua.agency_position
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE ua.agency_id = ? AND COALESCE(ua.is_active, TRUE) = TRUE${onlyId ? ' AND u.id = ?' : ''}
      ORDER BY u.last_name, u.first_name`, onlyId ? [scope.agencyId, onlyId] : [scope.agencyId]);
    let template = null;
    if (flags?.business_card_template) template = normalizeBusinessCardSettings(flags.business_card_template);
    const groups = [];
    let offices = [];
    if (scope.canManage && !onlyId) {
      const [[identities], [departments], [agencyOffices]] = await Promise.all([
        pool.execute(`SELECT id, identity_key, display_name, from_email, reply_to FROM email_sender_identities
          WHERE agency_id = ? AND is_active = TRUE ORDER BY display_name, identity_key`, [scope.agencyId]),
        pool.execute(`SELECT id, name FROM agency_departments
          WHERE agency_id = ? AND is_active = TRUE ORDER BY display_order, name`, [scope.agencyId]),
        pool.execute(`SELECT DISTINCT ol.id, ol.name, ol.street_address, ol.city, ol.state, ol.postal_code
          FROM office_locations ol JOIN office_location_agencies ola ON ola.office_location_id = ol.id
          WHERE ola.agency_id = ? AND COALESCE(ol.is_active, TRUE) = TRUE
          ORDER BY ol.name`, [scope.agencyId])
      ]);
      offices = agencyOffices.map(office => ({ ...office, agencyIds: [scope.agencyId], isActive: true }));
      for (const identity of identities) {
        if (String(identity.identity_key).toLowerCase().startsWith('personal_')) continue;
        groups.push({ id: `group:${identity.id}`, kind: 'group',
          name: identity.display_name || String(identity.identity_key).replace(/[_-]+/g, ' '),
          email: identity.reply_to || identity.from_email || '' });
      }
      for (const department of departments) {
        if (groups.some(group => group.name.trim().toLowerCase() === department.name.trim().toLowerCase())) continue;
        groups.push({ id: `department:${department.id}`, kind: 'department', name: department.name, email: '' });
      }
    }
    res.json({ agency, template, groups, offices, canManage: scope.canManage && !selfOnly, people: people.filter(activeStaff).map(p => ({ ...p, agency_ids: String(scope.agencyId) })) });
  } catch (error) { if (error.status === 400) return reject(res, 400, error.message); next(error); }
}

export async function putBusinessCardTemplate(req, res, next) {
  try {
    const scope = await access(req, res); if (!scope) return;
    if (!scope.canManage) return reject(res, 403, 'Only organization administrators can save the shared card template.');
    const template = normalizeBusinessCardSettings(req.body);
    // Change only this configuration key; preserve concurrent unrelated tenant settings.
    const [result] = await pool.execute(`UPDATE agencies SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.business_card_template', CAST(? AS JSON)) WHERE id = ?`, [JSON.stringify(template), scope.agencyId]);
    if (!result.affectedRows) return reject(res, 404, 'Organization not found.');
    res.json({ template });
  } catch (error) { if (error.status === 400) return reject(res, 400, error.message); next(error); }
}

export async function getEmployeeBusinessCard(req, res, next) {
  try {
    const scope = await access(req, res); if (!scope) return;
    const userId = positiveId(req.params.userId);
    if (!userId) return reject(res, 400, 'Invalid employee.');
    if (!scope.canManage && userId !== scope.actor.id) return reject(res, 403, 'You can print only your own employee card.');
    const [people] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, u.preferred_name, u.title, u.credential,
      u.work_phone, u.work_phone_extension, u.work_email, u.role, u.status, u.is_active, ua.agency_role, ua.agency_position
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE u.id = ? AND ua.agency_id = ? AND COALESCE(ua.is_active, TRUE) = TRUE LIMIT 1`, [userId, scope.agencyId]);
    const user = people[0]; if (!activeStaff(user)) return reject(res, 404, 'Active employee not found in this organization.');
    const [offices] = await pool.execute(`SELECT DISTINCT ol.id, ol.name, ol.street_address, ol.city, ol.state, ol.postal_code,
      COALESCE(uol.is_primary, FALSE) AS isPrimary, TRUE AS isActive
      FROM user_office_locations uol JOIN office_locations ol ON ol.id = uol.office_location_id
      JOIN office_location_agencies ola ON ola.office_location_id = ol.id
      WHERE uol.user_id = ? AND ola.agency_id = ? AND COALESCE(uol.is_active, TRUE) = TRUE AND COALESCE(ol.is_active, TRUE) = TRUE
      ORDER BY isPrimary DESC, ol.name`, [userId, scope.agencyId]);
    const contact = await resolveStaffSignatureContext({ userId, agencyId: scope.agencyId });
    const displayRole=await getProviderDisplayRole(userId,scope.agencyId);
    const workLine = await employeeBusinessCardWorkLine(userId, scope.agencyId);
    res.json({ user: { ...user, displayRole, agency_ids: String(scope.agencyId) }, offices: offices.map(o => ({ ...o, agencyIds: [scope.agencyId] })), contact: {
      email: contact.email, phone: contact.phone, website: contact.website, workLine,
      logoUrl: contact.logoUrl?.replace(/^https?:\/\/[^/]+\/(email-signatures\/.*)$/i, '/$1') || ''
    } });
  } catch (error) { next(error); }
}
