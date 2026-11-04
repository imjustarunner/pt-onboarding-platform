import pool from '../config/database.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';

/** Copy only the assigned provider's active work account within this agency. */
export async function appointmentProviderCopy(appointment, to) {
  if (!appointment.providerUserId || !appointment.agencyId) return [];
  const [[provider]] = await pool.execute(`SELECT u.work_email,u.email FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 LIMIT 1`,
  [appointment.agencyId,appointment.providerUserId]);
  const email=String(provider?.work_email || provider?.email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.toLowerCase()!==String(to).trim().toLowerCase() ? [email] : [];
}

export async function nativeAppointmentProviderCopy(ctx, appointment, to) {
  if (!appointment.data.providerAccountId) return [];
  const [[provider]]=await pool.execute(`SELECT a.id,a.profile FROM auricwell_accounts a
    JOIN auricwell_memberships m ON m.account_id=a.id AND m.practice_id=?
    WHERE a.id=? AND a.status='active' AND m.status='active' AND m.actor_type='staff' LIMIT 1`,
  [ctx.practiceId,appointment.data.providerAccountId]);
  if (!provider) return [];
  const profile=decryptFamilyBilling(provider.profile,`auricwell:account:${provider.id}`);
  const email=String(profile?.workEmail || profile?.email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.toLowerCase()!==String(to).trim().toLowerCase() ? [email] : [];
}
