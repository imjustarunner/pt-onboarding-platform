import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

const db = vi.hoisted(() => ({ execute: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => db.execute(...args) } }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: () => { throw new Error('Integration test must not send email'); } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: () => { throw new Error('Integration test must not send email'); } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: {} }));
import { DEFAULT_SCHOOL_CONTACT_TEMPLATE, getSchoolContactPlan, saveSchoolContactPlan } from '../schoolContactPlan.service.js';

describe.skipIf(!process.env.HUB_SCOPE_MYSQL_SOCKET)('school contact plan MySQL integration', () => {
  let connection;
  const databaseName = `school_contact_plan_test_${process.pid}`;
  beforeAll(async () => {
    connection = await mysql.createConnection({ socketPath: process.env.HUB_SCOPE_MYSQL_SOCKET, user: 'root', timezone: '+00:00' });
    await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${databaseName}\``);
    db.execute = (...args) => connection.execute(...args);
    for (const sql of [
      `CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(120),slug VARCHAR(120),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE,feature_flags JSON,organization_type VARCHAR(32))`,
      `CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(40),has_provider_access BOOLEAN DEFAULT FALSE,email VARCHAR(160),work_email VARCHAR(160),personal_email VARCHAR(160),sso_password_override BOOLEAN DEFAULT FALSE,login_is_group_email BOOLEAN DEFAULT FALSE,is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE)`,
      `CREATE TABLE user_agencies (agency_id INT,user_id INT,is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE organization_affiliations (agency_id INT,organization_id INT,is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE communication_inboxes (id INT PRIMARY KEY,agency_id INT,owner_user_id INT,kind VARCHAR(32),from_email VARCHAR(160),is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE provider_school_assignments (school_organization_id INT,provider_user_id INT,is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE client_provider_assignments (client_id INT,provider_user_id INT,organization_id INT,is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE email_sender_identities (agency_id INT,from_email VARCHAR(160),identity_key VARCHAR(48),is_active BOOLEAN DEFAULT TRUE)`
    ]) await connection.query(sql);
    for (const file of ['1719_school_provider_contact_plans.sql','1720_school_contact_automation.sql','1722_school_contact_three_attempts.sql']) {
      const source=await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8');
      for(const statement of source.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)) await connection.query(statement);
    }
    await connection.execute(`INSERT INTO agencies(id,name,slug,feature_flags,organization_type) VALUES
      (450,'ITSCOLLC','auricwell-qa-demo',JSON_OBJECT(),'agency'),
      (451,'Cedar Grove K-8','auricwell-qa-demo-school',JSON_OBJECT(),'school'),
      (2,'Other agency','real-agency',JSON_OBJECT(),'agency')`);
    await connection.execute(`INSERT INTO users(id,first_name,last_name,role,email,personal_email) VALUES
      (1433,'Avery','Demo','provider','avery@example.com','testing@itsco.health'),
      (1438,'Cameron','Demo','provider','cameron@example.com','testing@itsco.health')`);
    await connection.execute('INSERT INTO user_agencies(agency_id,user_id) VALUES(450,1433),(450,1438),(2,1433)');
    await connection.execute('INSERT INTO organization_affiliations(agency_id,organization_id) VALUES(450,451)');
    await connection.execute('INSERT INTO provider_school_assignments(school_organization_id,provider_user_id) VALUES(451,1433),(451,1438)');
    await connection.execute("INSERT INTO communication_inboxes(id,agency_id,owner_user_id,kind,from_email) VALUES(10,450,1433,'personal','qaproviderauricwell@itsco.health')");
    await connection.execute("INSERT INTO email_sender_identities(agency_id,from_email,identity_key) VALUES(450,'messages@itsco.health','messages')");
  });
  afterAll(async () => {
    if (connection) { await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); await connection.end(); }
  });
  it('executes all migrations and persists authored templates while enforcing the fixed48/96hour timeline', async () => {
    const input = { agencyId: 450, userId: 1433 };
    const state = await getSchoolContactPlan(input);
    expect(state).toMatchObject({ eligible: true, status: 'unconfigured', routing: { isSso: false, replyTo: 'testing@itsco.health' } });
    expect(state.preview.body).toContain('Avery Demo');
    expect(await getSchoolContactPlan({ agencyId: 451, userId: 1433 })).toMatchObject({ eligible: true, agencyId: 450 });
    expect(await saveSchoolContactPlan(input, { status: 'declined' })).toMatchObject({ status: 'declined' });
    const edited = `${DEFAULT_SCHOOL_CONTACT_TEMPLATE}\n\nI look forward to meeting you.`;
    const second=state.secondTemplate+'\nMy second email edit.',final=state.finalTemplate+'\nMy final email edit.',sms=state.smsTemplate+' Please let me know.';
    expect(await saveSchoolContactPlan(input,{status:'enabled',template:edited,secondTemplate:second,finalTemplate:final,smsTemplate:sms,smsAfterDays:9,emailAfterDays:20,staleAfterHours:72})).toMatchObject({status:'enabled',template:edited,secondTemplate:second,finalTemplate:final,smsTemplate:sms,smsAfterDays:2,emailAfterDays:4,staleAfterHours:48});
    const [[saved]]=await connection.execute('SELECT second_template,final_template,sms_template,sms_after_days,email_after_days,stale_after_hours FROM school_provider_contact_plans WHERE agency_id=450 AND provider_user_id=1433');
    expect(saved).toMatchObject({second_template:second,final_template:final,sms_template:sms,sms_after_days:2,email_after_days:4,stale_after_hours:48});
    const [[before]] = await connection.execute('SELECT decided_at FROM school_provider_contact_plans WHERE agency_id=450 AND provider_user_id=1433');
    await saveSchoolContactPlan(input, { staleAfterHours: 48 });
    const [[after]] = await connection.execute('SELECT decided_at FROM school_provider_contact_plans WHERE agency_id=450 AND provider_user_id=1433');
    expect(after.decided_at).toEqual(before.decided_at);
    expect(await getSchoolContactPlan({ agencyId: 450, userId: 1438 })).toMatchObject({ status: 'unconfigured' });
  });
  it('retains an administrator requirement without treating it as provider opt-in or replacing authored wording',async()=>{
    await connection.execute('UPDATE school_provider_contact_plans SET required_by_admin=1 WHERE agency_id=450 AND provider_user_id=1433');
    const before=await getSchoolContactPlan({agencyId:450,userId:1433});expect(before.mandatory).toBe(true);
    await expect(saveSchoolContactPlan({agencyId:450,userId:1433},{status:'declined'})).rejects.toMatchObject({status:409});
    const after=await getSchoolContactPlan({agencyId:450,userId:1433});expect(after.status).toBe('enabled');expect(after.template).toBe(before.template);expect(after.secondTemplate).toBe(before.secondTemplate);
  });
  it('blocks production tenants and revoked school access before preference mutation', async () => {
    await expect(saveSchoolContactPlan({ agencyId: 2, userId: 1433 }, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
    await connection.execute('UPDATE provider_school_assignments SET is_active=0 WHERE provider_user_id=1438');
    await expect(saveSchoolContactPlan({ agencyId: 450, userId: 1438 }, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
    const [[count]] = await connection.execute('SELECT COUNT(*) n FROM school_provider_contact_plans');
    expect(count.n).toBe(1);
  });
  it('resolves policy-driven SSO with mailbox copy while honoring per-provider password override', async () => {
    await connection.execute("UPDATE agencies SET feature_flags=JSON_OBJECT('googleSsoEnabled',true) WHERE id=450");
    expect(await getSchoolContactPlan({ agencyId: 450, userId: 1433 })).toMatchObject({ routing: { isSso: true, providerEmail: 'qaproviderauricwell@itsco.health', replyTo: 'messages@itsco.health' } });
    await connection.execute('UPDATE users SET sso_password_override=1 WHERE id=1433');
    expect(await getSchoolContactPlan({ agencyId: 450, userId: 1433 })).toMatchObject({ routing: { isSso: false, providerEmail: 'testing@itsco.health', replyTo: 'testing@itsco.health' } });
  });
});
