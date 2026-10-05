/** Offline validation by default. --apply requires an operator ID and touches DB.
 * node src/scripts/smsReadiness.js registration|consent /private/path/file.json [--apply --actor-user-id=N]
 * Consent --apply sends the required subscription confirmation (no bulk sends).
 */
import fs from 'node:fs/promises';
import { validateSmsRegistration, validateSmsConsentEvidence } from '../utils/smsCompliancePolicy.js';

const [kind, file, ...options] = process.argv.slice(2);
if (!['registration', 'consent'].includes(kind) || !file) {
  console.error('Usage: smsReadiness.js registration|consent file.json [--apply --actor-user-id=N]');
  process.exitCode = 1;
} else {
  let pool;
  try {
    const input = JSON.parse(await fs.readFile(file, 'utf8'));
    // Evidence validation is imported only here; offline registration validation
    // needs neither database credentials nor a connection.
    const errors = kind === 'registration' ? validateSmsRegistration(input.registration) : [];
    if (kind === 'registration' && !Number.isInteger(input.numberId)) errors.push('numberId is required');
    if (errors.length) throw new Error(errors.join('; '));
    if (!options.includes('--apply')) {
      if (kind === 'consent') {
        const consentErrors = validateSmsConsentEvidence(input);
        if (consentErrors.length) throw new Error(consentErrors.join('; '));
      }
      console.log('Local fields validated. Live pages, carrier approval, linking and consent evidence still require verification. No changes or messages sent.');
    } else {
      const actorUserId = Number(options.find((v) => v.startsWith('--actor-user-id='))?.split('=')[1]);
      if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new Error('--actor-user-id is required');
      pool = (await import('../config/database.js')).default;
      const [users] = await pool.execute('SELECT role FROM users WHERE id = ? AND is_active = TRUE', [actorUserId]);
      if (users[0]?.role !== 'super_admin') throw new Error('An active super_admin operator is required');
      const { saveSmsRegistration, enrollSmsRecipient } = await import('../services/smsEnrollment.service.js');
      if (kind === 'registration') await saveSmsRegistration({ ...input, actorUserId });
      else {
        const VonageService = (await import('../services/vonage.service.js')).default;
        await enrollSmsRecipient({ ...input, actorUserId, sendConfirmation: (message) => VonageService.sendSms(message) });
      }
      console.log(kind === 'registration' ? 'Registration recorded locally; no Vonage registration was submitted.' : 'Consent recorded; subscription confirmation sent for an opt-in.');
    }
  } catch (error) {
    console.error(error.code || 'sms_readiness_failed', error.message);
    process.exitCode = 1;
  } finally { if (pool) await pool.end(); }
}
