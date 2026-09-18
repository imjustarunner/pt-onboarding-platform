import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preserveSecretReferences } from './preserve-deploy-secrets.mjs';

test('preserves secret references while allowing unrelated runtime updates', () => {
  assert.equal(preserveSecretReferences('^|^NODE_ENV=production|DB_PASSWORD=example|PORT=8080', ['DB_PASSWORD']), '^|^NODE_ENV=production|PORT=8080');
});
test('retains multiline values and values containing equals signs', () => {
  assert.equal(preserveSecretReferences('^|^PUBLIC_SETTING=first\nsecond==|OTHER=x', []), '^|^PUBLIC_SETTING=first\nsecond==|OTHER=x');
});
test('does not confuse a prefix with the protected variable name', () => {
  assert.equal(preserveSecretReferences('^|^DB_PASSWORD=x|DB_PASSWORD_HINT=none', ['DB_PASSWORD']), '^|^DB_PASSWORD_HINT=none');
});
test('rejects malformed inventories and input without putting values in errors', () => {
  for (const names of [null, {}, [null], ['not a name']]) assert.throws(() => preserveSecretReferences('^|^TOKEN=secret-value', names), /^Error: Invalid secret-reference inventory$/);
  assert.throws(() => preserveSecretReferences('TOKEN=secret-value', []), /^Error: Unexpected deployment environment format$/);
  assert.throws(() => preserveSecretReferences('^|^TOKEN=secret-value|broken', []), /^Error: Invalid deployment environment entry$/);
});
