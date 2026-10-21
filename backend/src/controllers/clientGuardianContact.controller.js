import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';

// A chart contact is independent of portal access and signed intake answers.
export const updateClientGuardianContact = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid client id' } });
    }
    if (!['super_admin', 'admin', 'support', 'staff'].includes(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ error: { message: 'Only authorized client account staff can edit guardian contact information.' } });
    }
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const fields = { firstName: 150, lastName: 150, email: 254, phone: 60, relationship: 100, dateOfBirth: 10, primaryLanguage: 100 };
    const updates = {};
    for (const [field, limit] of Object.entries(fields)) {
      if (!Object.hasOwn(req.body || {}, field)) continue;
      const value = req.body[field];
      if (value !== null && typeof value !== 'string') {
        return res.status(400).json({ error: { message: `Invalid ${field}` } });
      }
      if (String(value || '').trim().length > limit) {
        return res.status(400).json({ error: { message: `${field} is too long` } });
      }
      updates[field] = String(value || '').trim() || null;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: { message: 'Enter guardian contact information.' } });
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      return res.status(400).json({ error: { message: 'Enter a valid guardian email address or leave it blank.' } });
    }
    if (updates.dateOfBirth) {
      const date = new Date(`${updates.dateOfBirth}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(updates.dateOfBirth) || !Number.isFinite(date.getTime())
        || date.toISOString().slice(0, 10) !== updates.dateOfBirth || date > new Date()) {
        return res.status(400).json({ error: { message: 'Enter a valid guardian date of birth.' } });
      }
    }
    const existing = await ClientGuardianIntakeProfile.findByClientId(clientId);
    const profile = { ...(existing || {}), ...updates };
    if (Object.hasOwn(updates, 'firstName') || Object.hasOwn(updates, 'lastName')) {
      profile.fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    }
    if (![profile.fullName, profile.firstName, profile.lastName, profile.email, profile.phone].some(Boolean)) {
      return res.status(400).json({ error: { message: 'Enter a guardian name, email, or phone number.' } });
    }
    const saved = await ClientGuardianIntakeProfile.upsertForClient({ clientId, profile, source: 'staff_contact_update' });
    let accountPreparation = { prepared: false, invitationSent: false };
    if (saved?.email) {
      const {prepareGuardianAccount}=await import('../services/guardianAccountPreparation.service.js');
      const {default:Client}=await import('../models/Client.model.js');
      accountPreparation=await prepareGuardianAccount({client:await Client.findById(clientId),profile:saved,actorUserId:req.user.id});
    }
    await logClientAccess(req, clientId, 'guardian_contact_updated');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ guardian_intake_profile: saved, accountPreparation });
  } catch (error) {
    next(error);
  }
};
