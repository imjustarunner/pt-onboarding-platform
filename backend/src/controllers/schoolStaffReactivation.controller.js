import { restoreSchoolStaffAccess } from '../services/schoolStaffReactivation.service.js';

export const createSchoolStaffReactivationHandler = ({ hasSchoolAccess, getSchoolRoleFlags }) => async (req, res, next) => {
  try {
    const orgId = Number(req.params.organizationId);
    const userId = Number(req.params.userId);
    if (![orgId, userId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).json({ error: { message: 'Invalid school or user id.' } });
    }
    const actorId = Number(req.user?.id);
    const role = String(req.user?.role || '').toLowerCase();
    const agencyRoles = ['super_admin', 'admin', 'staff', 'support', 'clinical_practice_assistant', 'provider_plus'];
    if ((!agencyRoles.includes(role) && role !== 'school_staff') || actorId === userId) {
      return res.status(403).json({ error: { message: 'An authorized administrator must restore account access.' } });
    }
    if (!await hasSchoolAccess({ userId: actorId, role, user: req.user, schoolOrganizationId: orgId })) {
      return res.status(403).json({ error: { message: 'You do not have access to this school.' } });
    }
    if (role === 'school_staff') {
      const flags = await getSchoolRoleFlags({ actorUserId: actorId, actorEmail: req.user?.email || req.user?.username, orgId });
      if (!flags.isSchoolAdmin) {
        return res.status(403).json({ error: { message: 'Only a School Admin can restore another staff account.' } });
      }
    }
    await restoreSchoolStaffAccess({ userId, schoolOrganizationId: orgId, actorUserId: actorId });
    res.json({ ok: true, message: 'Account access restored. Their password and school permissions are unchanged.' });
  } catch (error) {
    next(error);
  }
};
