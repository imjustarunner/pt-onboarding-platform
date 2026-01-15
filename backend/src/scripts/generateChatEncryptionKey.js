import crypto from 'crypto';

// Prints env vars to configure CLIENT_CHAT_ENCRYPTION_KEY_BASE64 safely.
// Usage: node src/scripts/generateChatEncryptionKey.js

const key = crypto.randomBytes(32);
const b64 = key.toString('base64');
const keyId = process.env.CLIENT_CHAT_ENCRYPTION_KEY_ID || 'v1';

console.log('Add these environment variables to your backend service (Cloud Run / local):');
console.log('');
console.log(`CLIENT_CHAT_ENCRYPTION_KEY_ID=${keyId}`);
console.log(`CLIENT_CHAT_ENCRYPTION_KEY_BASE64=${b64}`);
console.log('');
console.log('Notes:');
console.log('- Keep this secret (treat like a password).');
console.log('- Rotating the key requires a re-encryption migration strategy.');

