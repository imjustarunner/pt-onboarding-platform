import pool from '../config/database.js';
import { isVoiceCallingConfigured, isStaffTextingAvailable } from './staffPhoneAvailability.service.js';

const enabled = (value, fallback = true) => value == null ? fallback : [true, 1, '1', 'true'].includes(value);
const capabilitiesOf = value => {
  if (typeof value === 'object' && value) return value;
  try { return JSON.parse(value) || {}; } catch { return {}; }
};

// Public work lines only: never publish forwarding, personal, or legacy profile numbers.
// Both directions must work before inviting someone to call or text this number.
export async function employeeBusinessCardWorkLine(userId, agencyId) {
  const [assignments] = await pool.execute(`SELECT tn.id, tn.phone_number, tn.capabilities,
    tna.sms_access_enabled, cs.inbound_enabled, cs.outbound_enabled,
    cs.sms_inbound_enabled, cs.sms_outbound_enabled
    FROM twilio_number_assignments tna JOIN twilio_numbers tn ON tn.id = tna.number_id
    LEFT JOIN user_call_settings cs ON cs.user_id = tna.user_id
    WHERE tna.user_id = ? AND tn.agency_id = ? AND tna.is_active = TRUE
      AND tn.is_active = TRUE AND tn.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM twilio_number_assignments shared
        WHERE shared.number_id = tn.id AND shared.is_active = TRUE AND shared.user_id <> tna.user_id)
    ORDER BY tna.is_primary DESC, tna.created_at DESC, tn.id DESC`, [userId, agencyId]);
  for (const row of assignments) {
    const capabilities = capabilitiesOf(row.capabilities);
    const canText = isStaffTextingAvailable() && enabled(capabilities.sms ?? capabilities.SMS) && enabled(row.sms_access_enabled)
      && enabled(row.sms_inbound_enabled) && enabled(row.sms_outbound_enabled);
    const canCall = isVoiceCallingConfigured() && enabled(capabilities.voice, false)
      && enabled(row.inbound_enabled) && enabled(row.outbound_enabled);
    if ((canText || canCall) && row.phone_number) return { number: row.phone_number, canText, canCall };
  }
  return null;
}
