import { pathToFileURL } from 'node:url';
import { assertCarrierSmsPolicy } from '../services/vonage10dlc.service.js';
import { PLOTLINE_SENDER_DATABASE_USER, PLOTLINE_SENDER_SERVICE_ACCOUNT, PLOTLINE_SENDER_PROCEDURE,
  PLOTLINE_SENDER_PLAN_HASH, PLOTLINE_SMS_CALLBACK, plotlineSenderPlan, plotlineSenderProcedureSql,
  plotlineInterviewRuntimeConfig } from '../utils/plotlineInterviewSenderProvisioning.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };

export async function verifyPlotlineCarrier(env = process.env, fetcher = fetch) {
  if (!env.VONAGE_API_KEY || !env.VONAGE_API_SECRET) fail('PLOTLINE_CARRIER_CREDENTIALS_REQUIRED');
  const headers = { Authorization: 'Basic ' + Buffer.from(env.VONAGE_API_KEY + ':' + env.VONAGE_API_SECRET).toString('base64') };
  async function read(url, authenticated = true) {
    const response = await fetcher(url, { headers: authenticated ? headers : {}, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) fail('PLOTLINE_CARRIER_OR_CALLBACK_NOT_READY');
    return response.json();
  }
  const base = 'https://api-eu.vonage.com/v1/10dlc/brands/BCGLCIL/campaigns/VCZOP4JO';
  const [campaign, number, owned, callback] = await Promise.all([
    read(base), read(base + '/numbers/17197165766'),
    read('https://rest.nexmo.com/account/numbers?pattern=17197165766&search_pattern=0&size=100'),
    read(PLOTLINE_SMS_CALLBACK, false)
  ]);
  assertCarrierSmsPolicy({ campaign, number, registration: plotlineSenderPlan.registration,
    from: plotlineSenderPlan.phoneNumber, purpose: 'workforce', body: 'Interview reminder. https://plotlinepo.com/interview/example' });
  const matches = owned.numbers?.filter(item => item.msisdn === '17197165766');
  if (matches?.length !== 1 || matches[0].moHttpUrl !== PLOTLINE_SMS_CALLBACK || callback?.ready !== true) fail('PLOTLINE_CALLBACK_NOT_CONFIGURED');
  if (!String(campaign.help_message || '').toLowerCase().includes('support@plotlinepo.com')) fail('PLOTLINE_HELP_CONTACT_CHANGED');
  return { campaignStatus: campaign.status, numberStatus: number.status, callbackUrl: PLOTLINE_SMS_CALLBACK };
}

export async function runPlotlineProvisioning({ apply = false, env = process.env, connect, verifyCarrier = verifyPlotlineCarrier } = {}) {
  if (env.DB_USER !== PLOTLINE_SENDER_DATABASE_USER) fail('PLOTLINE_SCOPED_IDENTITY_REQUIRED');
  if (!/^[A-Za-z0-9_]+$/.test(env.DB_NAME || '') || !env.DB_PASSWORD || !(env.DB_SOCKET || env.DB_HOST)) fail('PLOTLINE_DATABASE_CONFIGURATION_REQUIRED');
  const mysql = connect ? null : await import('mysql2/promise');
  const database = await (connect || mysql.createConnection)({
    ...(env.DB_SOCKET ? { socketPath: env.DB_SOCKET } : { host: env.DB_HOST, port: Number(env.DB_PORT || 3306) }),
    database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: 10000
  });
  try {
    const [[identity]] = await database.query('SELECT CURRENT_USER() AS database_identity, USER() AS session_identity');
    if ([identity.database_identity, identity.session_identity].some(value => String(value).split('@')[0] !== PLOTLINE_SENDER_DATABASE_USER)) fail('PLOTLINE_SCOPED_IDENTITY_REQUIRED');
    const [grants] = await database.query('SHOW GRANTS FOR CURRENT_USER()');
    const scope = `GRANT EXECUTE ON PROCEDURE \`${env.DB_NAME}\`.\`${PLOTLINE_SENDER_PROCEDURE}\` TO `;
    const values = grants.flatMap(Object.values);
    if (!values.length || !values.some(value => value.startsWith(scope))
      || values.some(value => !value.startsWith('GRANT USAGE ON *.* TO ') && !value.startsWith(scope))) fail('PLOTLINE_DATABASE_SCOPE_TOO_BROAD');
    const carrier = apply ? await verifyCarrier(env) : null;
    const [result] = await database.query(`CALL ${PLOTLINE_SENDER_PROCEDURE}(?,?)`, [PLOTLINE_SENDER_PLAN_HASH, apply]);
    return { mode: apply ? 'apply' : 'preview', automationIdentity: identity.database_identity,
      carrier, summary: result.filter(Array.isArray).at(-1), runtimeConfig: plotlineInterviewRuntimeConfig };
  } finally {
    await database.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--plan', '--sql', '--preview', '--apply'].includes(arg))) fail('PLOTLINE_INVALID_ARGUMENTS');
  if (args[0] === '--sql') return console.log('DELIMITER $$\n' + plotlineSenderProcedureSql() + '$$\nDELIMITER ;');
  if (!args.length || args[0] === '--plan') return console.log(JSON.stringify({
    plan: plotlineSenderPlan, manifestHash: PLOTLINE_SENDER_PLAN_HASH, databaseUser: PLOTLINE_SENDER_DATABASE_USER,
    cloudServiceAccount: PLOTLINE_SENDER_SERVICE_ACCOUNT, procedure: PLOTLINE_SENDER_PROCEDURE,
    runtimeConfig: plotlineInterviewRuntimeConfig, applicationRecordsChanged: false
  }, null, 2));
  const result = await runPlotlineProvisioning({ apply: args[0] === '--apply' });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const code = /^PLOTLINE_[A-Z_]+$/.test(error.sqlMessage || '') ? error.sqlMessage : error.code || 'PLOTLINE_PROVISIONING_FAILED';
    console.error(JSON.stringify({ errorCode: code, credentialsPrinted: false }));
    process.exitCode = 1;
  });
}
