import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock('../unifiedEmail/ticketInboundAttachments.service.js', () => ({ persistGmailAttachmentsForTicket: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn(() => { throw new Error('No email sends allowed in database tests'); }) }));
import { ingestTechnologyEmail } from '../technologySupport.service.js';
import { queueSchoolOnboardingWelcome } from '../schoolOnboardingWelcome.service.js';
const enabled = process.env.RUN_SCHOOL_WELCOME_MYSQL === '1';
let db;
beforeAll(async () => {
 if (!enabled) return;
 dotenv.config({ path: process.env.SCHOOL_WELCOME_TEST_ENV });
 db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
});
afterAll(async () => { if(db){await db.rollback();await db.end();} });
it.skipIf(!enabled)('checks real SQL, encrypted message schema, Michael assignment and duplicate receipts; rolls everything back',async()=>{
 await db.beginTransaction();
 const connection={execute:db.execute.bind(db),beginTransaction:async()=>{},commit:async()=>{},rollback:db.rollback.bind(db),release:()=>{}};
 const database={getConnection:async()=>connection};
 const id=randomUUID();
 const input={identity:{id:7,agency_id:2,identity_key:'technology',from_email:'Technology@itsco.health'},fromEmail:'technology-smoke-test@example.invalid',subject:'ROLLBACK ONLY: Technology routing verification',bodyText:'Synthetic integration test. No email was sent.',messageId:`<${id}@example.invalid>`,threadId:`test-${id}`,gmailMessageId:`test-${id}`,recipients:['Technology@itsco.health']};
 try {
 const result=await ingestTechnologyEmail(input,database);
 expect(result.ingested).toBe(true);
 const [[ticket]]=await db.execute('SELECT topic,claimed_by_user_id,school_organization_id FROM support_tickets WHERE id=?',[result.ticketId]);
 expect(ticket).toMatchObject({topic:'technology',claimed_by_user_id:501,school_organization_id:2});
 expect((await ingestTechnologyEmail(input,database)).duplicate).toBe(true);
 const [[messages]]=await db.execute('SELECT COUNT(*) AS count FROM support_ticket_messages WHERE ticket_id=?',[result.ticketId]);expect(messages.count).toBe(1);
 await queueSchoolOnboardingWelcome({agencyId:2,schoolOrganizationId:430,sourceType:'collaborative_update',sourceId:64},db);
 await queueSchoolOnboardingWelcome({agencyId:2,schoolOrganizationId:430,sourceType:'onboarding',sourceId:1},db);
 const [[jobs]]=await db.execute('SELECT COUNT(*) AS count FROM school_onboarding_welcome_emails WHERE agency_id=2 AND school_organization_id=430');expect(jobs.count).toBe(1);
 }finally{await db.rollback();}
});
