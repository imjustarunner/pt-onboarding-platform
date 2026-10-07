import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({encrypt:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:m.encrypt}));
import {createPhoneFollowupTicket,normalizePhoneFollowup} from '../phoneFollowupTicket.service.js';
const body=()=>({requestId:'12345678-1234-1234-1234-123456789abc',topic:'billing',outcome:'callback_requested',callerName:'Private caller',callbackPhone:'7195550123',notes:'Private balance question'});
let conn,db,digest,existingId,conflict,notificationFailure;
beforeEach(()=>{
 vi.clearAllMocks();m.encrypt.mockReturnValue({ciphertextB64:'cipher',ivB64:'iv',authTagB64:'tag',keyId:'key'});existingId=null;conflict=false;notificationFailure=false;
 conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
 if(sql.startsWith('INSERT INTO phone_followup')){digest=args[2];return [{}];}
 if(sql.startsWith('SELECT ticket_id'))return [[{ticket_id:existingId,request_digest:conflict?'different':digest}]];
 if(sql.startsWith('INSERT INTO support_tickets'))return [{insertId:101}];
 if(sql.startsWith('SELECT DISTINCT'))return [[{id:7},{id:8}]];
 if(sql.startsWith('INSERT INTO notifications')&&notificationFailure)throw Error('notification storage unavailable');
 return [{}];
 })};db={getConnection:vi.fn().mockResolvedValue(conn)};
});
const submit=()=>createPhoneFollowupTicket({agencyId:2,userId:7,body:body()},db);
it('creates an encrypted open Billing ticket and generic in-app notice in one transaction',async()=>{
 expect(await submit()).toEqual({ticketId:101,topic:'billing',duplicate:false});
 const [sql,args]=conn.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO support_tickets'));
 expect(sql).toContain("NULL,'open','medium','tenant',?,'phone','phone_followup'");expect(args).toEqual([2,2,7,'Billing phone follow-up','billing','cipher','iv','tag','key']);
 expect(m.encrypt).toHaveBeenCalledWith(expect.stringContaining('Callback: +17195550123'));
 const notices=conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO notifications'));expect(notices).toHaveLength(1);expect(notices[0][1]).toEqual(['Billing phone follow-up','Ticket #101 needs follow-up. Open the ticket to review and claim it.',8,2,101,7]);
 expect(JSON.stringify(conn.execute.mock.calls)).not.toContain('Private');
 const recipients=conn.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT DISTINCT'));expect(recipients[1]).toEqual([2]);expect(recipients[0]).toContain('ua.is_active=TRUE');expect(recipients[0]).toContain('has_billing_access');
 expect(conn.commit).toHaveBeenCalledOnce();expect(conn.rollback).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalledOnce();
});
it('returns the original ticket on retry without inserting or notifying again',async()=>{existingId=101;expect(await submit()).toMatchObject({ticketId:101,duplicate:true});expect(conn.execute.mock.calls.some(([s])=>s.startsWith('INSERT INTO support_tickets'))).toBe(false);expect(conn.execute.mock.calls.find(([s])=>s.startsWith('SELECT ticket_id'))[1]).toEqual([2,body().requestId]);});
it('rejects reuse of a request key for different details',async()=>{conflict=true;existingId=101;await expect(submit()).rejects.toMatchObject({status:409});expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();});
it('rolls back the ticket and request key when notifications cannot be saved',async()=>{notificationFailure=true;await expect(submit()).rejects.toThrow('notification storage unavailable');expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();expect(conn.release).toHaveBeenCalledOnce();});
it('never falls back to storing plaintext when encryption fails',async()=>{m.encrypt.mockImplementation(()=>{throw Error('No key');});await expect(submit()).rejects.toThrow('No key');expect(db.getConnection).not.toHaveBeenCalled();});
it('routes general follow-ups to support recipients',async()=>{await createPhoneFollowupTicket({agencyId:2,userId:7,body:{...body(),topic:'general'}},db);expect(conn.execute.mock.calls.find(([s])=>s.startsWith('SELECT DISTINCT'))[0]).toContain("'support','clinical_practice_assistant'");});
it.each([{requestId:'bad'},{topic:'payroll'},{outcome:'resolved'},{notes:''},{notes:'x'.repeat(5001)},{callbackPhone:'911'},{callerName:123}])('rejects invalid follow-up data before writing',patch=>{expect(()=>normalizePhoneFollowup({...body(),...patch})).toThrow();});
