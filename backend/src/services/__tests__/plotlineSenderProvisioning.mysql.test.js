import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { PLOTLINE_SENDER_DATABASE_USER as user, PLOTLINE_SENDER_PROCEDURE as procedure,
  PLOTLINE_SENDER_PLAN_HASH as hash, plotlineSenderProcedureSql, plotlineSenderGrantSql } from '../../utils/plotlineInterviewSenderProvisioning.js';
import { runPlotlineProvisioning } from '../../scripts/provisionPlotlineInterviewSender.mjs';

// Opt-in only. This must point to a disposable MySQL 8 instance on a dedicated
// local test port. Never use the production Cloud SQL proxy or backend/.env.
it.skipIf(!process.env.PLOTLINE_PROVISIONING_TEST_MYSQL_URL)('executes the immutable procedure, denies direct access, and preserves idempotency in isolated MySQL', async () => {
  const url = new URL(process.env.PLOTLINE_PROVISIONING_TEST_MYSQL_URL);
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '43327') {
    throw new Error('PLOTLINE_TEST_REQUIRES_DISPOSABLE_LOCAL_MYSQL_ON_43327');
  }
  const { default: mysql } = await import('mysql2/promise');
  const name = 'plotline_provisioning_test_' + randomBytes(6).toString('hex');
  const password = 'Test9!' + randomBytes(24).toString('hex');
  let admin, scoped, createdDatabase = false, createdUser = false;
  try {
    admin = await mysql.createConnection(url.href);
    await admin.query('CREATE DATABASE `' + name + '`'); createdDatabase = true;
    await admin.query('USE `' + name + '`');
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [user, password]); createdUser = true;
    for (const ddl of [
      'CREATE TABLE twilio_numbers(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT NULL,phone_number VARCHAR(32) UNIQUE,twilio_sid VARCHAR(64),friendly_name VARCHAR(255),capabilities JSON,status VARCHAR(32),is_active BOOLEAN,number_purpose VARCHAR(64))',
      'CREATE TABLE sms_sender_registrations(number_id INT PRIMARY KEY,campaign_id VARCHAR(64),registration_json JSON,updated_by_user_id INT NULL)',
      'CREATE TABLE hiring_interview_sms_consents(id INT PRIMARY KEY)',
      "CREATE TABLE user_activity_log(id INT AUTO_INCREMENT PRIMARY KEY,action_type ENUM('api_call'),user_id INT NULL,agency_id INT NULL,metadata JSON)"
    ]) await admin.query(ddl);
    await admin.query(plotlineSenderProcedureSql());
    await admin.query(plotlineSenderGrantSql(name));
    const env = { DB_USER: user, DB_PASSWORD: password, DB_NAME: name, DB_HOST: url.hostname, DB_PORT: url.port };
    const options = { env, connect: config => mysql.createConnection(config), verifyCarrier: async () => ({ numberStatus: 'LINKED' }) };
    expect((await runPlotlineProvisioning(options)).summary[0].provisioning_status).toBe('preview');
    expect((await runPlotlineProvisioning({ ...options, apply: true })).summary[0].provisioning_status).toBe('applied');
    expect((await runPlotlineProvisioning({ ...options, apply: true })).summary[0].provisioning_status).toBe('already_configured');
    const [[count]] = await admin.query('SELECT (SELECT COUNT(*) FROM twilio_numbers) AS numbers,(SELECT COUNT(*) FROM sms_sender_registrations) AS registrations,(SELECT COUNT(*) FROM user_activity_log) AS events');
    expect(count).toEqual({ numbers: 1, registrations: 1, events: 1 });
    const [[event]] = await admin.query('SELECT user_id,agency_id,metadata FROM user_activity_log');
    expect(event.user_id).toBeNull(); expect(event.agency_id).toBeNull();
    const metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
    expect(metadata.actor_type).toBe('automation');
    expect(metadata.database_session_user.startsWith(user + '@')).toBe(true);
    const [[registration]] = await admin.query('SELECT updated_by_user_id,registration_json FROM sms_sender_registrations');
    expect(registration.updated_by_user_id).toBeNull();
    const json = typeof registration.registration_json === 'string' ? JSON.parse(registration.registration_json) : registration.registration_json;
    expect(json.platformInterviewSender).toBe(true);
    scoped = await mysql.createConnection({ host: url.hostname, port: Number(url.port), user, password, database: name });
    await expect(scoped.query('SELECT * FROM twilio_numbers')).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
    await expect(scoped.query("UPDATE twilio_numbers SET status=status WHERE 1=0")).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
    await expect(scoped.query('CALL ' + procedure + '(?,FALSE)', ['invalid'])).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    await expect(admin.query('CALL ' + procedure + '(?,TRUE)', [hash])).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    await admin.query('UPDATE twilio_numbers SET agency_id=2');
    await expect(scoped.query('CALL ' + procedure + '(?,TRUE)', [hash])).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    const [[preserved]] = await admin.query('SELECT COUNT(*) AS events FROM user_activity_log');
    expect(preserved.events).toBe(1);
  } catch (error) {
    // MySQL errors can contain SQL and parameters. Keep credentials out of test logs.
    if (error.code) throw new Error('Isolated MySQL test failed with ' + error.code);
    throw error;
  } finally {
    await scoped?.end();
    if (createdUser) await admin.query("DROP USER ?@'%'", [user]);
    if (createdDatabase) await admin.query('DROP DATABASE `' + name + '`');
    await admin?.end();
  }
}, 30000);
