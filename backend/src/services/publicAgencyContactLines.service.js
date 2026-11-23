import pool from '../config/database.js';
import { faxReferralRoutes } from './faxReferralPolicy.js';
import { notifyreRequest } from './auricwell/sessionTransports.js';
import { notifyreFaxNumbers } from './auricwell/faxPolicy.js';
import { resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { isDemographicsEncryptionConfigured } from './demographicsImport.service.js';
import { isGuardianIntakeEncryptionConfigured } from './guardianIntakeEncryption.service.js';

let faxNumberCache;
async function activeFaxNumbers() {
  if (faxNumberCache?.expires > Date.now()) return faxNumberCache.result;
  const result = notifyreRequest(process.env.NOTIFYRE_API_TOKEN, '/fax/numbers').then(payload => ({
    verified: true, numbers: notifyreFaxNumbers(payload)
  })).catch(() => {
    // A short retry window avoids sending configuration checks on every website visit.
    if (faxNumberCache?.result === result) faxNumberCache.expires = Date.now() + 30_000;
    return { verified: false, numbers: [] };
  });
  faxNumberCache = { result, expires: Date.now() + 300_000 };
  return result;
}

export async function publicAgencyContactLines(slug) {
  const routes = faxReferralRoutes();
  const configuredFax = [...routes].find(([, agencySlug]) => agencySlug === slug)?.[0];
  if (!['itsco','nlu','tisi'].includes(slug) && !configuredFax) return null;
  const [agencies] = await pool.execute(`SELECT id FROM agencies WHERE LOWER(slug) = ?
    AND organization_type = 'agency' AND is_active = 1 AND COALESCE(is_archived,0) = 0`, [slug]);
  if (agencies.length !== 1) return null;
  const faxReady = configuredFax && isDemographicsEncryptionConfigured() && isGuardianIntakeEncryptionConfigured();
  const [appointmentSms, faxStatus] = await Promise.all([
    resolveRegisteredSmsSender({ agencyId: agencies[0].id, purpose: 'reminders' }),
    faxReady ? activeFaxNumbers() : null
  ]);
  return {
    appointmentSms: appointmentSms || null,
    referralFax: faxStatus?.verified && faxStatus.numbers.includes(configuredFax) ? configuredFax : null
  };
}
