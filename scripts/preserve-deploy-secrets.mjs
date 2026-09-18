import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Retain configured Secret Manager references instead of creating an intermediate
// revision with its credentials removed. Input/output values must not be logged.
export function preserveSecretReferences(updates, secretNames) {
  if (!Array.isArray(secretNames) || secretNames.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    throw new Error('Invalid secret-reference inventory');
  }
  if (typeof updates !== 'string' || !updates.startsWith('^|^')) throw new Error('Unexpected deployment environment format');
  const protectedNames = new Set(secretNames);
  const entries = updates.slice(3).split('|');
  for (const entry of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(entry)) throw new Error('Invalid deployment environment entry');
  }
  return '^|^' + entries.filter(entry => !protectedNames.has(entry.slice(0, entry.indexOf('=')))).join('|');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(preserveSecretReferences(process.env.DEPLOY_ENV_VARS, JSON.parse(readFileSync(0, 'utf8'))));
  } catch {
    console.error('Unable to preserve configured secret references; deployment stopped.');
    process.exitCode = 1;
  }
}
