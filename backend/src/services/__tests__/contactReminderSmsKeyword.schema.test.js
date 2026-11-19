import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute:vi.fn(), update:vi.fn(), record:vi.fn() }));
vi.mock('../../config/database.js', () => ({default:{execute:mocks.execute}}));
vi.mock('../../models/ClientContactAffiliation.model.js', () => ({default:{update:mocks.update}}));
vi.mock('../smsCompliance.service.js', () => ({recordSmsPermission:mocks.record}));
vi.mock('../../utils/smsCompliancePolicy.js', () => ({validateSmsRegistration:()=>[]}));
import { applyContactReminderSmsKeyword } from '../contactReminderSmsConsent.service.js';
import { contactReminderPhoneHash } from '../../utils/contactReminderConsent.js';

it('processes signed commands using the actual guardian or self relationship schema',async()=>{
 const db=new DatabaseSync(':memory:');
 try {
   db.exec(`CREATE TABLE clients(id INTEGER PRIMARY KEY);
     CREATE TABLE agency_contacts(id INTEGER PRIMARY KEY, agency_id INTEGER, phone TEXT, is_active INTEGER);
     CREATE TABLE users(id INTEGER PRIMARY KEY,is_active INTEGER);
     CREATE TABLE client_guardians(client_id INTEGER,guardian_user_id INTEGER,relationship_type TEXT,access_enabled INTEGER,permissions_json TEXT);
     CREATE TABLE client_contact_affiliations(id INTEGER, client_id INTEGER, agency_contact_id INTEGER,agency_id INTEGER,is_active INTEGER,sms_reminders_enabled INTEGER,sms_sender_number_id INTEGER,sms_invitation_sent_at TEXT,sms_invitation_permission_at TEXT,notify_ack_at TEXT,notify_ack_by_user_id INTEGER,sms_consent_phone_hash TEXT);
     INSERT INTO clients VALUES(3);
     INSERT INTO agency_contacts VALUES(9,2,'303-555-0123',1);
     INSERT INTO users VALUES(7,1);
     INSERT INTO client_guardians VALUES(3,7,'self',1,'{}');`);
   const phone='+13035550123';
   db.prepare("INSERT INTO client_contact_affiliations VALUES(1,3,9,2,1,1,5,'saved','saved','saved',7,?)").run(contactReminderPhoneHash(phone));
   mocks.execute.mockImplementation(async(sql,params)=>[db.prepare(sql.replace("REGEXP_REPLACE(COALESCE(c.phone,''),'[^0-9]','')", "REPLACE(c.phone,'-','')")).all(...params)]);
   const input={sender:{agency_id:2,id:5,scope:'synthetic',registration:{provider:'notifyre',allowRestart:true}},phone,messageId:'synthetic'};
   await expect(applyContactReminderSmsKeyword({...input,keyword:'START'})).resolves.toBe(1);
   db.exec("UPDATE client_guardians SET relationship_type='guardian'");
   await expect(applyContactReminderSmsKeyword({...input,keyword:'START'})).resolves.toBe(1);
   db.exec("UPDATE client_guardians SET permissions_json=json_object('billingOnly',1)");
   await expect(applyContactReminderSmsKeyword({...input,keyword:'START'})).resolves.toBe(0);
   db.exec('DELETE FROM client_guardians');
   await expect(applyContactReminderSmsKeyword({...input,keyword:'STOP'})).resolves.toBe(1);
   expect(mocks.update).toHaveBeenLastCalledWith(1,expect.objectContaining({smsOptIn:false,smsConsentStatus:'stopped'}));
 } finally {db.close();}
});
