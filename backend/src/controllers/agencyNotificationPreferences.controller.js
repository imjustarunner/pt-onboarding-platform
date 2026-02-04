import AgencyNotificationPreferences from '../models/AgencyNotificationPreferences.model.js';
import User from '../models/User.model.js';

async function ensureAgencyAccess(req, agencyId) {
  if (req.user?.role === 'super_admin' || req.user?.role === 'admin' || req.user?.role === 'support') return true;
  const agencies = await User.getAgencies(req.user.id);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

export const getAgencyNotificationPreferences = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    const ok = await ensureAgencyAccess(req, agencyId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    const prefs = await AgencyNotificationPreferences.getByAgencyId(agencyId);
    const defaults = {
      messaging_new_inbound_client_text: false,
      messaging_support_safety_net_alerts: false,
      messaging_replies_to_my_messages: false,
      messaging_client_notes: false,
      school_portal_client_updates: false,
      school_portal_client_update_org_swaps: false,
      school_portal_client_comments: false,
      school_portal_client_messages: false,
      scheduling_room_booking_approved_denied: false,
      scheduling_schedule_changes: false,
      scheduling_room_release_requests: false,
      compliance_credential_expiration_reminders: false,
      compliance_access_restriction_warnings: false,
      compliance_payroll_document_availability: false,
      surveys_client_checked_in: false,
      surveys_survey_completed: false,
      system_emergency_broadcasts: true,
      system_org_announcements: false,
      program_reminders: false
    };
    res.json(prefs || { agencyId, defaults, userEditable: false, enforceDefaults: true });
  } catch (e) {
    next(e);
  }
};

export const updateAgencyNotificationPreferences = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    const ok = await ensureAgencyAccess(req, agencyId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    const defaults = req.body?.defaults && typeof req.body.defaults === 'object' ? req.body.defaults : null;
    const userEditable = req.body?.userEditable === undefined ? true : !!req.body.userEditable;
    const enforceDefaults = req.body?.enforceDefaults === undefined ? false : !!req.body.enforceDefaults;
    const saved = await AgencyNotificationPreferences.upsert({ agencyId, defaults, userEditable, enforceDefaults });
    res.json(saved);
  } catch (e) {
    next(e);
  }
};
