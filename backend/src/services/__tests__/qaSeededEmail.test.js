import {beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
import pool from '../../config/database.js';
import {seededQaEmailAccount,personalReminderSenderMatches} from '../qaSeededEmail.service.js';
import {emailWorkerAccountSql} from '../../utils/qaEmailPolicy.js';
import {rewriteHogwartsOutboundRecipient} from '../../utils/hogwartsTestEmail.js';
import {notificationTransportReceipt} from '../../utils/notificationTransportReceipt.js';
const avery={id:1433,is_demo:1,personal_email:'qa.avery.personal@example.com'};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);});
it('includes seeded QA accounts in worker selection while retaining the exclusion in other tenants',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE users (id INTEGER,is_demo INTEGER,agency_id INTEGER); INSERT INTO users VALUES (1433,1,450),(1465,1,451),(12,1,452),(13,1,2),(14,0,2)');
 expect(db.prepare(`SELECT u.id FROM users u WHERE ${emailWorkerAccountSql('u','u.agency_id')} ORDER BY u.id`).all().map(r=>r.id)).toEqual([12,14,1433,1465]);db.close();
});
it.each([450,451,452,453,454])('forces all To/Cc/Bcc to the testing inbox for QA agency %s, including keep-real addresses',async agencyId=>{
 const result=await rewriteHogwartsOutboundRecipient({agencyId,to:'qa.avery.personal@example.com',cc:'williams@itsco.health',bcc:'real.person@gmail.com',subject:'QA workflow'});
 expect(result).toMatchObject({to:'testing@itsco.health',cc:'testing@itsco.health',bcc:'testing@itsco.health',redirected:true});
 expect(result.originalTo).toContain('qa.avery.personal@example.com');expect(result.originalTo).toContain('williams@itsco.health');
});
it('keeps real delivery exemptions outside the QA organizations',async()=>{
 expect(await rewriteHogwartsOutboundRecipient({agencyId:2,to:'williams@itsco.health',subject:'Real workflow'})).toMatchObject({to:'williams@itsco.health',redirected:false});
});
it('requires active, dedicated QA sandbox membership, using the user ID rather than reminder/identity ID',async()=>{
 expect(await seededQaEmailAccount(avery,{agencyId:450})).toBe(false);
 pool.execute.mockResolvedValue([[{id:1433}]]);
 expect(await seededQaEmailAccount({...avery,id:1120,user_id:1433},{agencyId:450})).toBe(true);
 expect(pool.execute.mock.calls.at(-1)[1]).toEqual([1433,450,450]);
 expect(await seededQaEmailAccount({...avery,is_demo:0},{agencyId:450})).toBe(false);
 expect(await seededQaEmailAccount(avery,{agencyId:2})).toBe(false);
});
it('accepts the physical inbox only for the exact seeded personal alias in its QA agency',async()=>{
 pool.execute.mockResolvedValue([[{id:1433}]]);
 expect(await personalReminderSenderMatches(avery,'testing@itsco.health',450)).toBe(true);
 for(const [account,from,agency] of [[avery,'other@itsco.health',450],[avery,'testing@itsco.health',2],[{...avery,is_demo:0},'testing@itsco.health',450],[{...avery,personal_email:'real@other.org'},'testing@itsco.health',450]])
  expect(await personalReminderSenderMatches(account,from,agency)).toBe(false);
 pool.execute.mockResolvedValue([[]]);expect(await personalReminderSenderMatches(avery,'testing@itsco.health',450)).toBe(false);
});
it('requires a real transport ID and matching single-inbox redirect proof',()=>{
 const result={id:'gmail-id',redirected:true,testInboxRedirect:{agencyId:450,deliveredTo:['testing@itsco.health']}};
 expect(notificationTransportReceipt(result,450).accepted).toBe(true);
 for(const bad of [{...result,id:null},{...result,blocked:true},{...result,pendingApproval:true},{...result,queued:true},{...result,testInboxRedirect:{agencyId:2,deliveredTo:['testing@itsco.health']}},{...result,testInboxRedirect:{agencyId:450,deliveredTo:['other@itsco.health']}}])
  expect(notificationTransportReceipt(bad,450).accepted).toBe(false);
 expect(notificationTransportReceipt(result,2).accepted).toBe(false);
});
