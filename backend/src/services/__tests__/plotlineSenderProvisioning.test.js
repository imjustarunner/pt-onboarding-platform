import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSmsRegistration } from '../../utils/smsCompliancePolicy.js';
import { PLOTLINE_SENDER_DATABASE_USER as user, PLOTLINE_SENDER_PROCEDURE as procedure,
  PLOTLINE_SENDER_PLAN_HASH as hash, PLOTLINE_SMS_CALLBACK as callback, plotlineSenderPlan,
  plotlineSenderProcedureSql, plotlineSenderGrantSql } from '../../utils/plotlineInterviewSenderProvisioning.js';
import { runPlotlineProvisioning, verifyPlotlineCarrier } from '../../scripts/provisionPlotlineInterviewSender.mjs';

const env = { DB_USER: user, DB_PASSWORD: 'synthetic-test-password', DB_HOST: '127.0.0.1', DB_NAME: 'synthetic_plotline_test' };
let database, connect, verify;
beforeEach(() => {
  database = { end: vi.fn(), query: vi.fn(async sql => {
    if (sql.startsWith('SELECT CURRENT_USER')) return [[{ database_identity: user + '@%', session_identity: user + '@test' }]];
    if (sql.startsWith('SHOW GRANTS')) return [[{ grant: `GRANT EXECUTE ON PROCEDURE \`${env.DB_NAME}\`.\`${procedure}\` TO '${user}'@'%'` }]];
    return [[[ { provisioning_status: 'applied', number_id: 42 } ], {}]];
  }) };
  connect = vi.fn(async () => database);
  verify = vi.fn(async () => ({ numberStatus: 'LINKED' }));
});

it('binds the provisioner to the approved interview-only manifest and null human actors', () => {
  expect(validateSmsRegistration(plotlineSenderPlan.registration)).toEqual([]);
  const sql = plotlineSenderProcedureSql();
  expect(sql).toContain("SUBSTRING_INDEX(USER(),'@',1) <> '" + user + "'");
  expect(sql).toContain("p_plan_hash <> '" + hash + "'");
  expect(sql).toContain('p_apply IS NULL');
  expect(sql).toContain("VALUES('api_call',NULL,NULL,JSON_OBJECT");
  expect(sql).toContain('updated_by_user_id)\n      VALUES(v_number_id,\'VCZOP4JO\',v_registration,NULL)');
  expect(sql).toContain('PLOTLINE_NUMBER_OWNERSHIP_CONFLICT');
  expect(sql).toContain('PLOTLINE_EXISTING_REGISTRATION_CONFLICT');
  expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|REPLACE|TRUNCATE|ALTER|DROP)\b/);
  expect(sql).not.toMatch(/\b(?:clients|users|hiring_interviews|sms_recipient_permissions)\b/);
  expect(readFileSync(new URL('../../scripts/sql/plotline-interview-sender-20261126.sql', import.meta.url), 'utf8'))
    .toContain('DELIMITER $$\n' + sql + '$$\nDELIMITER ;');
  expect(plotlineSenderGrantSql(env.DB_NAME)).toContain('GRANT EXECUTE ON PROCEDURE');
  expect(() => plotlineSenderGrantSql('invalid`database')).toThrow('PLOTLINE_INVALID_DATABASE');
});
it('refuses a human, ordinary application, or administrative database identity', async () => {
  await expect(runPlotlineProvisioning({ env: { ...env, DB_USER: 'root' }, connect, verifyCarrier: verify })).rejects.toMatchObject({ code: 'PLOTLINE_SCOPED_IDENTITY_REQUIRED' });
  expect(connect).not.toHaveBeenCalled();
});
it('rejects broader database grants before attempting carrier verification or application writes', async () => {
  database.query.mockImplementation(async sql => sql.startsWith('SELECT')
    ? [[{ database_identity: user + '@%', session_identity: user + '@test' }]]
    : [[{ grant: "GRANT ALL PRIVILEGES ON *.* TO '" + user + "'@'%'" }]]);
  await expect(runPlotlineProvisioning({ env, apply: true, connect, verifyCarrier: verify })).rejects.toMatchObject({ code: 'PLOTLINE_DATABASE_SCOPE_TOO_BROAD' });
  expect(verify).not.toHaveBeenCalled();
  expect(database.query.mock.calls.some(([sql]) => sql.startsWith('CALL'))).toBe(false);
  expect(database.end).toHaveBeenCalledOnce();
});
it('previews with a false apply flag and makes no carrier requests', async () => {
  await runPlotlineProvisioning({ env, connect, verifyCarrier: verify });
  expect(verify).not.toHaveBeenCalled();
  expect(database.query).toHaveBeenLastCalledWith(`CALL ${procedure}(?,?)`, [hash, false]);
  expect(database.end).toHaveBeenCalledOnce();
});
it('requires live carrier readiness before applying the fixed manifest', async () => {
  await runPlotlineProvisioning({ env, apply: true, connect, verifyCarrier: verify });
  expect(verify).toHaveBeenCalledWith(env);
  expect(database.query).toHaveBeenLastCalledWith(`CALL ${procedure}(?,?)`, [hash, true]);
  verify.mockRejectedValueOnce(Object.assign(new Error('not ready'), { code: 'test_carrier_blocked' }));
  database.query.mockClear();
  await expect(runPlotlineProvisioning({ env, apply: true, connect, verifyCarrier: verify })).rejects.toMatchObject({ code: 'test_carrier_blocked' });
  expect(database.query.mock.calls.some(([sql]) => sql.startsWith('CALL'))).toBe(false);
});

const carrier = { campaign_id: 'VCZOP4JO', brand_id: 'BCGLCIL', status: 'ACTIVE', traffic_enabled: true,
  reseller_id: 'R000000', usecase: 'LOW_VOLUME', sub_usecases: ['ACCOUNT_NOTIFICATION'], opt_out_assist: false,
  embedded_link: true, embedded_phone: true, help_message: 'Plotline People Operations: support@plotlinepo.com' };
const providerEnv = { VONAGE_API_KEY: 'synthetic-key', VONAGE_API_SECRET: 'synthetic-secret' };
function provider(campaign = carrier, numberStatus = 'LINKED', inboundUrl = callback) {
  return vi.fn(async (url, options) => ({ ok: true, json: async () => {
    if (url === callback) { expect(options.headers.Authorization).toBeUndefined(); return { ready: true }; }
    if (url.includes('/account/numbers?')) return { numbers: [{ msisdn: '17197165766', moHttpUrl: inboundUrl }] };
    if (url.includes('/numbers/')) return { number: '17197165766', status: numberStatus };
    return campaign;
  } }));
}
it('verifies the exact linked campaign and callback using GET only, without sending any texts', async () => {
  const fetcher = provider();
  await expect(verifyPlotlineCarrier(providerEnv, fetcher)).resolves.toMatchObject({ campaignStatus: 'ACTIVE', numberStatus: 'LINKED' });
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [, options] of fetcher.mock.calls) expect(options.method).toBeUndefined();
});
it('rejects suspended, unlinked, mismatched or differently configured provider resources', async () => {
  await expect(verifyPlotlineCarrier(providerEnv, provider({ ...carrier, traffic_enabled: false }))).rejects.toMatchObject({ code: 'sms_carrier_campaign_blocked' });
  await expect(verifyPlotlineCarrier(providerEnv, provider(carrier, 'LINKING'))).rejects.toMatchObject({ code: 'sms_carrier_number_unlinked' });
  await expect(verifyPlotlineCarrier(providerEnv, provider({ ...carrier, campaign_id: 'OTHER' }))).rejects.toMatchObject({ code: 'sms_carrier_campaign_blocked' });
  await expect(verifyPlotlineCarrier(providerEnv, provider(carrier, 'LINKED', 'https://example.test/callback'))).rejects.toMatchObject({ code: 'PLOTLINE_CALLBACK_NOT_CONFIGURED' });
  await expect(verifyPlotlineCarrier(providerEnv, provider({ ...carrier, help_message: 'support@example.test' }))).rejects.toMatchObject({ code: 'PLOTLINE_HELP_CONTACT_CHANGED' });
});
it('defaults to a printable plan without loading production credentials or opening a database', () => {
  const script = fileURLToPath(new URL('../../scripts/provisionPlotlineInterviewSender.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ applicationRecordsChanged: false, manifestHash: hash,
    runtimeConfig: { platform: { scope: 'all_agencies' } } });
  const refused = spawnSync(process.execPath, [script, '--apply'], { env: { PATH: process.env.PATH, DB_USER: 'root' }, encoding: 'utf8' });
  expect(refused.status).toBe(1);
  expect(JSON.parse(refused.stderr).errorCode).toBe('PLOTLINE_SCOPED_IDENTITY_REQUIRED');
});
