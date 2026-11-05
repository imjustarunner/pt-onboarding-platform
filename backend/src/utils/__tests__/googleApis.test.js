import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { google } from '../googleApis.js';
import { OAuth2Client, JWT } from 'google-auth-library';

test('Workspace clients use the existing authentication classes without loading the full API catalog', () => {
  assert.equal(google.auth.OAuth2, OAuth2Client);
  assert.equal(google.auth.JWT, JWT);
  const require = createRequire(import.meta.url);
  assert.equal(require.cache[require.resolve('googleapis')], undefined);
  const loadedApis = new Set(Object.keys(require.cache).map(file =>
    file.match(/\/googleapis\/build\/src\/apis\/([^/]+)\//)?.[1]).filter(Boolean));
  assert.deepEqual([...loadedApis].sort(), ['admin', 'calendar', 'drive', 'gmail', 'groupssettings', 'meet']);
});

test('all Workspace API factories retain explicit auth and request routing', async () => {
  const urls = [];
  const auth = { request: async options => { urls.push(options.url); return { data: { verified: true } }; } };
  const calls = [
    () => google.calendar({ version: 'v3', auth }).calendarList.list(),
    () => google.gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' }),
    () => google.drive({ version: 'v3', auth }).files.get({ fileId: 'fixture' }),
    () => google.admin({ version: 'directory_v1', auth }).users.get({ userKey: 'fixture@example.test' }),
    () => google.groupssettings({ version: 'v1', auth }).groups.get({ groupUniqueId: 'fixture@example.test' }),
    () => google.meet({ version: 'v2', auth }).spaces.get({ name: 'spaces/fixture' })
  ];
  for (const call of calls) assert.deepEqual((await call()).data, { verified: true });
  assert.equal(urls.length, calls.length);
  assert.ok(urls.every(url => url.startsWith('https://')));
});
