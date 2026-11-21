import User from '../models/User.model.js';
import { activeMessageStaff } from '../services/messageReminderRecipient.service.js';
import { normalizeStaffContactAddress } from '../utils/staffContactAddress.js';

export async function updateMyPersonalEmail(req, res, next) {
  try {
    const id = Number(req.user?.id);
    if (!id || req.user.switchedFromUserId || req.user.demoMode) {
      return res.status(403).json({ error: { message: 'Sign in to your own staff account to edit your personal email.' } });
    }
    const user = await User.findById(id);
    if (!user || !activeMessageStaff(user) || user.terminated_at) {
      return res.status(403).json({ error: { message: 'An active staff account is required.' } });
    }

    const raw = req.body?.personalEmail;
    const address = typeof raw === 'string' ? normalizeStaffContactAddress(raw) : '';
    if (!address || address.length > 255) {
      return res.status(400).json({ error: { message: 'Enter a valid personal email address.' } });
    }
    if (address !== normalizeStaffContactAddress(user.personal_email)) {
      const existing = await User.findByEmail(address);
      if (existing && Number(existing.id) !== id) {
        return res.status(409).json({ error: { message: 'That email address is already associated with another account.' } });
      }
      await User.update(id, { personalEmail: address });
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json({ personalEmail: address });
  } catch (error) {
    next(error);
  }
}
