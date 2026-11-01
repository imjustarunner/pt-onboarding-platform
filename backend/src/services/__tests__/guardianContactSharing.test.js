import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn()}}));
import {guardianContactSharing,sharedGuardianContact,sharedHistoryRecipient,readGuardianContactSharing,saveGuardianContactSharing,redactGuardianThreadAuthors} from '../guardianContactSharing.service.js';
let rows, db;
beforeEach(()=>{
  rows=[{id:10,access_enabled:1,first_name:'Alex',last_name:'QA',email:'alex@example.test',phone:'7195550100',permissions_json:{clinical:true}},
    {id:11,access_enabled:1,first_name:'Taylor',last_name:'QA',email:'taylor@example.test',phone:'7195550101',permissions_json:{contactSharing:{name:false,email:false,phone:true}}}];
  db={execute:vi.fn(async(sql,args)=>{
    if(sql.startsWith('SELECT DISTINCT client_id'))return [[{client_id:20}]];
    if(sql.startsWith('SELECT'))return [rows];
    const own=rows.find(r=>r.id===args[2]);own.permissions_json={...own.permissions_json,contactSharing:JSON.parse(args[0])};return [{affectedRows:1}];
  })};
});
it('shares each field by default and honors individual opt-outs without hiding the owner’s own details',()=>{
  expect(guardianContactSharing(null)).toEqual({name:true,email:true,phone:true});
  expect(sharedGuardianContact(rows[1],10)).toMatchObject({name:'Guardian',email:null,phone:'7195550101',hiddenFields:['name','email']});
  expect(sharedGuardianContact(rows[1],11)).toMatchObject({name:'Taylor QA',email:'taylor@example.test',hiddenFields:[]});
});
it('keeps access restrictions stronger than sharing preferences',()=>{
  expect(sharedGuardianContact(rows[1],10,{noViewOtherGuardian:true})).toMatchObject({name:'Guardian',email:null,phone:null});
});
it('uses the same choices for email, phone and name in shared history',()=>{
  expect(sharedHistoryRecipient('taylor@example.test','email',rows,10)).toContain('hidden');
  expect(sharedHistoryRecipient('+1 (719) 555-0101','sms',rows,10)).toBe('+1 (719) 555-0101');
  expect(sharedHistoryRecipient('7195550101','sms',rows,10)).toBe('7195550101');
  expect(sharedHistoryRecipient('Taylor QA','in_app',rows,10)).toContain('hidden');
  expect(sharedHistoryRecipient('alex@example.test','email',rows,10)).toBe('alex@example.test');
});
it('saves only the requester’s choices for this dependent without replacing other permissions',async()=>{
  await saveGuardianContactSharing(20,10,{name:true,email:false,phone:false},db);
  const [sql,args]=db.execute.mock.calls.find(([q])=>q.startsWith('UPDATE'));
  expect(sql).toContain("'$.contactSharing'");expect(sql).toContain('guardian_user_id=? AND access_enabled=1');
  expect(args.slice(1)).toEqual([20,10]);expect(rows[0].permissions_json.clinical).toBe(true);
  expect(rows[1].permissions_json.contactSharing.phone).toBe(true);
});
it('rejects a foreign or revoked relationship and unrecognized permission fields',async()=>{
  await expect(readGuardianContactSharing(20,999,db)).rejects.toMatchObject({status:403});
  rows[0].access_enabled=0;
  await expect(saveGuardianContactSharing(20,10,{name:false,email:false,phone:false},db)).rejects.toMatchObject({status:403});
  await expect(saveGuardianContactSharing(20,11,{name:true,email:true,phone:true,noView:false},db)).rejects.toMatchObject({status:400});
  expect(db.execute.mock.calls.some(([q])=>q.startsWith('UPDATE'))).toBe(false);
});
it('redacts hidden author names in shared message metadata without changing authored content',async()=>{
  const messages=[{sender_user_id:11,sender_first_name:'Taylor',sender_last_name:'QA',body:'Previously authored content.'}];
  expect(await redactGuardianThreadAuthors(1,10,messages,db)).toEqual([{sender_user_id:11,sender_first_name:'Guardian',sender_last_name:'',sender_profile_photo_path:null,body:'Previously authored content.'}]);
});
