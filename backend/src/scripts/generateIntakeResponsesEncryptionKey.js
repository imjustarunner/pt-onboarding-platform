import crypto from 'crypto';

// Prints env vars to configure INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 safely.
// Usage: node src/scripts/generateIntakeResponsesEncryptionKey.js

const key = crypto.randomBytes(32);
const b64 = key.toString('base64');
const keyId = process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_ID || 'v1';

console.log('Add these environment variables to your backend service (Cloud Run / local .env):');
console.log('');
console.log(`INTAKE_RESPONSES_ENCRYPTION_KEY_ID=${keyId}`);
console.log(`INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=${b64}`);
console.log('');
console.log('Notes:');
console.log('- Treat this secret like a password. Anyone with it can decrypt every');
console.log('  intake submission payload (intake_data + signer_name/email/phone/initials).');
console.log('- The service also accepts GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 as a fallback,');
console.log('  so if you already configured that one for client_guardian_intake_profiles,');
console.log('  you do NOT need to set a new key — the same key will cover both tables.');
console.log('- Rotating the key requires a re-encryption migration strategy (see');
console.log('  INTAKE_RESPONSES_ENCRYPTION_KEYS_JSON for the key-ring format).');
