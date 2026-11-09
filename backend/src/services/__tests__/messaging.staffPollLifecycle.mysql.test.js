import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
import fs from 'node:fs';
import { withPollFollowupLock } from '../staffPollFollowups.service.js';
import { saveStaffPotluckContribution } from '../staffEventPotluck.service.js';
import { recordCompanyEventSmsDeliveryStatus } from '../companyEventSms.service.js';
import { closeStaffPoll, saveStaffPollVote, scheduleStaffPollClosing } from '../staffPollLifecycle.service.js';
const enabled = !!process.env.STAFF_POLL_MYSQL_SOCKET || process.env.STAFF_POLL_MYSQL_TEST === '1';
const database = `staff_poll_lifecycle_${process.pid}`;
let admin, db;
const vote = key => saveStaffPollVote({ eventId: 20, agencyId: 4, userId: 2, response: { key, label: key === '1' ? 'Tuesday' : 'Friday', raw: key }, source: 'in_app' }, db);
describe.skipIf(!enabled)('poll closing and response edits in isolated MySQL', () => {
  beforeAll(async () => {
    const options = process.env.STAFF_POLL_MYSQL_SOCKET ? { socketPath: process.env.STAFF_POLL_MYSQL_SOCKET, user: 'root' }
      : { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
    admin = await mysql.createConnection(options); await admin.query(`CREATE DATABASE ${database}`);
    db = mysql.createPool({ ...options, database, connectionLimit: 5, timezone: '+00:00' });
    await db.query(`CREATE TABLE company_events (id INT PRIMARY KEY, agency_id INT, is_active BOOL, potluck_enabled BOOL DEFAULT 1, event_type VARCHAR(40), ends_at DATETIME, voting_closed_at DATETIME, voting_config_json JSON, updated_by_user_id INT, updated_at DATETIME)`);
    await db.query(`CREATE TABLE company_event_responses (id INT AUTO_INCREMENT PRIMARY KEY, company_event_id INT, user_id INT, response_key VARCHAR(32), response_label VARCHAR(200), response_body TEXT, source VARCHAR(20), from_number VARCHAR(20), received_at DATETIME, UNIQUE KEY one_vote(company_event_id,user_id), FOREIGN KEY(company_event_id) REFERENCES company_events(id))`);
    await db.query('CREATE TABLE users (id INT PRIMARY KEY)');await db.query('INSERT INTO users VALUES (2),(3)');
    await db.query('CREATE TABLE company_event_need_list_items (id INT PRIMARY KEY, company_event_id INT, agency_id INT, item_name VARCHAR(255), item_notes TEXT, claimed_by_user_id INT, claimed_by_guest_email VARCHAR(255), claimed_by_guest_name VARCHAR(255), claimed_at DATETIME)');
    await db.query("CREATE TABLE company_event_sms_deliveries (id INT PRIMARY KEY, status VARCHAR(24), status_reason VARCHAR(255), provider_message_id VARCHAR(255), responded_at DATETIME)");
    await db.query('CREATE TABLE company_event_dispatch_logs (id INT PRIMARY KEY)');
    const migration=fs.readFileSync(new URL('../../../../database/migrations/1784_conversa_poll_delivery_visibility.sql',import.meta.url),'utf8');
    for(const sql of migration.split(';').map(value=>value.trim()).filter(Boolean)) await db.query(sql);
  });
  beforeEach(async () => {
    await db.query('DELETE FROM company_event_need_list_items');await db.query('DELETE FROM company_event_sms_deliveries');await db.query('DELETE FROM company_event_poll_views');
    await db.query('DELETE FROM company_event_responses'); await db.query('DELETE FROM company_events');
    await db.execute(`INSERT INTO company_events(id,agency_id,is_active,event_type,ends_at,voting_config_json) VALUES(20,4,1,'team_poll','2099-12-31 12:00:00',?)`, [JSON.stringify({ enabled: true })]);
    await vote('1');
  });
  afterAll(async () => { if (db) await db.end(); if (admin) { await admin.query(`DROP DATABASE ${database}`); await admin.end(); } });
  it('updates the same response before closing', async () => {
    await vote('2'); const [rows] = await db.query('SELECT user_id,response_key,source FROM company_event_responses');
    expect(rows).toEqual([{ user_id: 2, response_key: '2', source: 'in_app' }]);
  });
  it('does not overwrite a saved response when a manual close wins the event lock', async () => {
    const closing = await db.getConnection(); await closing.beginTransaction();
    await closing.execute('SELECT id FROM company_events WHERE id=20 FOR UPDATE');
    const pending = vote('2').then(() => ({ allowed: true }), error => ({ code: error.code }));
    await closing.execute('UPDATE company_events SET voting_closed_at=UTC_TIMESTAMP() WHERE id=20');
    await closing.commit(); closing.release();
    expect(await pending).toEqual({ code: 'poll_closed' });
    const [[response]] = await db.query('SELECT response_key FROM company_event_responses'); expect(response.response_key).toBe('1');
  });
  it('blocks edits at the scheduled deadline before the background worker finalizes closure', async () => {
    await db.execute("UPDATE company_events SET voting_config_json=JSON_SET(voting_config_json,'$.closesAt',?) WHERE id=20", ['2026-01-01T12:00:00.000Z']);
    await expect(vote('2')).rejects.toMatchObject({ code: 'poll_closed' });
    const result = await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db);
    expect(result.closed).toBe(true); expect(result.row.voting_closed_at.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });
  it('only one concurrent worker records a new closure', async () => {
    const results = await Promise.all([closeStaffPoll({ eventId: 20, agencyId: 4 }, db), closeStaffPoll({ eventId: 20, agencyId: 4 }, db)]);
    expect(results.filter(result => result.closed)).toHaveLength(1);
  });
  it('schedules an RSVP deadline without moving the actual event dates', async () => {
    await db.query("UPDATE company_events SET event_type='company_event' WHERE id=20");
    await scheduleStaffPollClosing({ eventId: 20, agencyId: 4, actorUserId: 2, closesAt: '2099-11-01T12:00:00Z' }, db);
    const [[row]] = await db.query('SELECT ends_at,voting_config_json FROM company_events');
    expect(row.ends_at.toISOString()).toBe('2099-12-31T12:00:00.000Z'); expect(row.voting_config_json.closesAt).toBe('2099-11-01T12:00:00.000Z');
    expect((await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db)).closed).toBe(false);
  });
  it('prevents simultaneous workers from sending a follow-up twice',async()=>{
    let unblock,entered;const waiting=new Promise(resolve=>{unblock=resolve}),ready=new Promise(resolve=>{entered=resolve});
    const first=withPollFollowupLock(20,async()=>{entered();await waiting;return 'sent';},db);await ready;
    try{await expect(withPollFollowupLock(20,async()=>{throw Error('duplicate send')},db)).rejects.toMatchObject({status:409});}finally{unblock();await first;}
    expect(await withPollFollowupLock(20,async()=>true,db)).toBe(true);
  });
  it('preserves carrier delivery time when a later reply or accepted receipt arrives',async()=>{
    await db.query("INSERT INTO company_event_sms_deliveries(id,status,provider_message_id) VALUES(1,'sent','receipt-1')");
    await recordCompanyEventSmsDeliveryStatus('receipt-1','delivered',db);
    const [[before]]=await db.query('SELECT delivered_at FROM company_event_sms_deliveries');expect(before.delivered_at).toBeInstanceOf(Date);
    await db.query('UPDATE company_event_sms_deliveries SET responded_at=UTC_TIMESTAMP()');await recordCompanyEventSmsDeliveryStatus('receipt-1','accepted',db);
    const [[after]]=await db.query('SELECT status,delivered_at FROM company_event_sms_deliveries');expect(after.status).toBe('delivered');expect(after.delivered_at).toEqual(before.delivered_at);
  });
  it('only lets one invitee claim the same potluck slot',async()=>{
    await db.query("INSERT INTO company_event_need_list_items(id,company_event_id,agency_id,item_name,item_notes) VALUES(8,20,4,'Food','[OPEN_REQUEST_SLOT]')");
    const claim=userId=>saveStaffPotluckContribution({eventId:20,agencyId:4,userId,itemId:8,customItemName:userId===2?'Fruit salad':'Bread'},db);
    const results=await Promise.allSettled([claim(2),claim(3)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason.status).toBe(409);
  });

});
