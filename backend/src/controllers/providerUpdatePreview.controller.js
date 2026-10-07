import pool from '../config/database.js';
import {getStaffCommunicationChoices} from '../services/staffCommunicationChoices.service.js';
import User from '../models/User.model.js';
import PayrollCompensationLevel, { COMPENSATION_CATEGORIES } from '../models/PayrollCompensationLevel.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import { assertAgencyAdmin, listOpenForBookingForProvider, normalizeSectionAudience, recipientSeesSection, listFallActionClientsForProvider } from '../services/providerUpdate.service.js';
import { enabledSectionKeys, getSectionMeta } from '../constants/providerUpdateSections.js';

// Read-only even for unsaved drafts. Do not create recipient tokens, signature tasks,
// section progress, time entries, or notifications while an admin is previewing.
export async function previewProviderUpdate(req, res, next) {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const providerId = Number(req.params.providerUserId);
    const [[provider]] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.title, u.credential
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE u.id = ? AND ua.agency_id = ? AND COALESCE(u.is_archived, 0) = 0 LIMIT 1`, [providerId, agencyId]);
    if (!provider) return res.status(404).json({ error: { message: 'Provider not found in this agency.' } });
    const audience = normalizeSectionAudience(req.body.sectionAudience || {});
    const supervisors = await User.getSupervisors(providerId, agencyId);
    let keys = enabledSectionKeys(req.body.sectionConfig).filter(key => recipientSeesSection(key, audience, providerId));
    if (!supervisors.length) keys = keys.filter(key => key !== 'supervision_hours');
    if (keys.includes('client_fall_update') && audience.client_fall_update?.mode === 'auto'
        && !(await listFallActionClientsForProvider(providerId, agencyId)).length) keys = keys.filter(key => key !== 'client_fall_update');
    const [[fields], offices, pay, supervision] = await Promise.all([
      pool.execute(`SELECT d.field_key, v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id = v.field_definition_id
        WHERE v.user_id = ? AND (d.agency_id IS NULL OR d.agency_id = ?)
        AND d.field_key IN ('provider_credential_license_type_number','provider_credential_license_issued_date','provider_credential_license_expiration_date')
        ORDER BY (d.agency_id IS NOT NULL), d.id`, [providerId, agencyId]),
      keys.includes('office_schedule') ? listOpenForBookingForProvider(providerId, agencyId) : [],
      keys.includes('amendments') ? PayrollCompensationLevel.getForUser(agencyId, providerId) : null,
      keys.includes('supervision_hours') ? SupervisionSession.getHoursSummaryForSupervisee(agencyId, providerId) : null
    ]);
    const values = Object.fromEntries(fields.map(row => [row.field_key, row.value]));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ previewOnly: true, provider, sections: keys.map(key => ({ key, meta: getSectionMeta(key) })), offices, supervision,
      communicationChoices:keys.includes('notification_prefs') ? await getStaffCommunicationChoices({userId:providerId,agencyId}) : null,
      license: { number: values.provider_credential_license_type_number || '', issued: values.provider_credential_license_issued_date || '', expires: values.provider_credential_license_expiration_date || '' },
      compensation: pay ? { category: pay.category, categoryLabel: COMPENSATION_CATEGORIES[pay.category]?.label || '', level: pay.level,
        label: pay.label, directRate: pay.direct_rate, indirectRate: pay.indirect_rate, ffsRate: pay.ffs_rate,
        hasFfs: !!Number(pay.has_ffs), bypass: !!Number(pay.bypass) } : null,
      amendment: { title: req.body.amendmentPlan?.title || 'Contract amendment', effectiveDate: req.body.amendmentPlan?.effectiveDate || null,
        status: 'Draft preview — amendment wording and individual terms still require review.' }
    });
  } catch (error) { next(error); }
}
