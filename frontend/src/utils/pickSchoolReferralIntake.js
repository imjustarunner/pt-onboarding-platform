/** School login / QR: pick the shareable English referral shell (masters overlay on open). */

export function isReferralPacketIntake(link) {
  const ft = String(link?.form_type || 'intake').toLowerCase();
  if (ft === 'smart_school_roi') return false;
  if (['job_application', 'medical_records_request', 'smart_registration', 'internal_preferences', 'life_balance_wheel'].includes(ft)) {
    return false;
  }
  return ft === 'intake' || ft === 'public_form' || !ft;
}

function languageOf(link) {
  return String(link?.language_code || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * Prefer the English school referral shell. Spanish is an in-form toggle onto the
 * published ES master — do not open a retired per-school Spanish copy.
 */
export function pickMasterStaffIntake(links) {
  const pool = (links || []).filter(isReferralPacketIntake);
  if (!pool.length) return null;
  const english = pool.filter((l) => languageOf(l) === 'en');
  const inheriting = english.filter((l) => Number(l.inherits_school_master || 0) === 1);
  const search = inheriting.length ? inheriting : (english.length ? english : pool);
  const packetish = search.find((l) =>
    /referral packet|paquete de referencia|school referral/i.test(String(l?.title || ''))
  );
  return packetish || search[0] || pool[0] || null;
}
