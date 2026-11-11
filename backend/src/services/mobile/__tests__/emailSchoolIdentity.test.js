import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {mobileEmailSchoolIdentities,mobileEmailPersonIdentities} from '../emailSchoolIdentity.service.js';
const receipt={conversation_id:5,agency_id:10,to_json:JSON.stringify([{email:' Bradley@Example.invalid '}]),cc_json:[]};
const school={agency_id:10,itsco_email:'Bradley@Example.invalid',id:77,name:'Bradley',logo_path:'school/bradley.png'};
function database(receipts=[receipt],schools=[school]){return {execute:vi.fn().mockResolvedValueOnce([receipts]).mockResolvedValueOnce([schools])};}
it('resolves a unique active school from trusted receipt kind and exact structured recipient, never a subject',async()=>{
 const db=database(),result=await mobileEmailSchoolIdentities([{id:5,latest_kind:'school_group_notification'}],{db});
 expect(result.get(5)).toMatchObject({schoolId:77,schoolName:'Bradley',avatar:expect.stringContaining('school/bradley.png')});
 const [[receiptSql,ids],[schoolSql,args]]=db.execute.mock.calls;
 expect(receiptSql).toContain("m.auto_reply_kind='school_group_notification'");expect(receiptSql).not.toContain('JSON_TABLE');expect(ids).toEqual([5]);
 expect(schoolSql).toContain('organization_affiliations');expect(schoolSql).toContain('COLLATE utf8mb4_unicode_ci');expect(schoolSql).not.toContain('subject');expect(args).toEqual([10,'bradley@example.invalid']);
});
it('does not invent branding from subject text, arbitrary recipient strings or malformed JSON',async()=>{
 const db=database([{...receipt,to_json:[],cc_json:[],from_json:{email:'unrelated@example.invalid'}}],[]);expect((await mobileEmailSchoolIdentities([{id:5,subject:'Bradley - Digital Enrollment Packet'}],{db})).size).toBe(0);expect(db.execute.mock.calls[1][1]).not.toContain('bradley@example.invalid');
 const malformed=database([{...receipt,to_json:'not-json',cc_json:['bradley@example.invalid']}]);
 expect((await mobileEmailSchoolIdentities([{id:5,latest_kind:'school_group_notification'}],{db:malformed})).size).toBe(0);expect(malformed.execute).toHaveBeenCalledTimes(1);
});
it('decodes driver JSON arrays and cc recipients, preserving each conversation’s agency',async()=>{
 const db=database([{...receipt,to_json:[],cc_json:[{email:'bradley@example.invalid'}]},{...receipt,conversation_id:6,agency_id:20}], [school]);
 const result=await mobileEmailSchoolIdentities([{id:5,latest_kind:'school_group_notification'},{id:6,latest_kind:'school_group_notification'}],{db});
 expect(result.get(5)?.schoolId).toBe(77);expect(result.has(6)).toBe(false);
});
it('suppresses ambiguous school matches rather than choosing one logo',async()=>{
 const db=database([receipt],[school,{...school,id:78,logo_path:'other.png'}]);
 expect((await mobileEmailSchoolIdentities([{id:5,latest_kind:'school_group_notification'}],{db})).size).toBe(0);
});

it('uses exact From aliases for a school without requiring a notification kind',async()=>{const db=database([{...receipt,to_json:[],from_json:{email:' BRADLEY@example.invalid '}}]);expect((await mobileEmailSchoolIdentities([{id:5}],{db})).get(5)?.schoolId).toBe(77);expect(db.execute.mock.calls[0][0]).toContain('m.from_json');});
it('matches the actual staff sender photo only inside its current agency',async()=>{const db={execute:vi.fn().mockResolvedValue([[{id:22,agency_id:10,email:'provider@example.invalid',profile_photo_path:'people/provider.png'}]])};const result=await mobileEmailPersonIdentities([{id:5,agency_id:10,latest_from:{email:' PROVIDER@example.invalid '}},{id:6,agency_id:20,latest_from:{email:'provider@example.invalid'}}],{db});expect(result.get(5)).toMatchObject({staffId:22,avatar:expect.stringContaining('people/provider.png')});expect(result.has(6)).toBe(false);expect(db.execute.mock.calls[0][0]).toContain('COALESCE(ua.is_active,1)=1');expect(db.execute.mock.calls[0][0]).not.toContain('JSON_TABLE');});
it('does not choose a staff face when an email alias is ambiguous',async()=>{const db={execute:vi.fn().mockResolvedValue([[{id:22,agency_id:10,email:'same@example.invalid',profile_photo_path:'one.png'},{id:23,agency_id:10,email:'same@example.invalid',profile_photo_path:'two.png'}]])};expect((await mobileEmailPersonIdentities([{id:5,agency_id:10,sender_email:'same@example.invalid'}],{db})).size).toBe(0);});
