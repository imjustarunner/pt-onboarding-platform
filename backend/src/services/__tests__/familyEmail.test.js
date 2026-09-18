import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),benefit:vi.fn(),household:vi.fn(),save:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:async()=>({execute:mocks.execute,beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release})}}));
vi.mock('../familyAuth.service.js',async()=>{const crypto=await import('node:crypto');return {assertFamilyBenefit:mocks.benefit,requireHousehold:mocks.household,familyHash:x=>crypto.createHash('sha256').update(x).digest('hex')};});
vi.mock('../family.service.js',()=>({saveFamilyEntry:mocks.save,familyTransaction:async fn=>fn({execute:mocks.execute})}));
import {extractFamilyEmailText,parseFamilyEmail,authenticatedFamilySender,buildFamilySummary,familySummaryText,familyEmailHtml} from '../familyEmailPolicy.js';
import {handleFamilyEmailInbound,addFamilyPocketItems,getFamilyPocket} from '../familyEmail.service.js';
const headers=[{name:'From',value:'Dad <dad@example.com>'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@example.com; dmarc=pass (p=REJECT) header.from=example.com'}];
const input={fromEmail:'dad@example.com',subject:'Add groceries: milk, eggs',bodyText:'',agencyId:1,senderIdentityId:88,headers,gmailMessageId:'gmail-123',messageIdHeader:'<test@example.com>'};
let ledger,entries,homes;
beforeEach(()=>{
 vi.clearAllMocks();ledger=null;entries=[];homes=[{id:7,name:'Our family'}];
 mocks.benefit.mockResolvedValue();mocks.household.mockResolvedValue({id:7,name:'Our family',role:'parent',timezone:'America/Denver'});
 mocks.save.mockImplementation(async(_session,_id,entry)=>{entries.push({id:entries.length+1,kind:entry.kind,title:entry.title,metadata:entry.metadata});return {id:entries.length};});
 mocks.execute.mockImplementation(async(sql,params)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT * FROM family_email_requests'))return [ledger?[ledger]:[]];
  if(sql.includes('SELECT COUNT(*)'))return [[{count:0}]];
  if(sql.includes('INSERT')&&sql.includes('family_email_requests')){ledger ||= {};return [{affectedRows:1}];}
  if(sql.includes('SET applied_at')){ledger.applied_at=new Date();ledger.result_json=params[0];return [{}];}
  if(sql.includes('SET replied_at')){ledger.replied_at=new Date();return [{}];}
  if(sql.includes('SELECT id,email FROM users'))return [[{id:1,email:'dad@example.com'}]];
  if(sql.includes('SELECT email FROM users'))return [[{email:'dad@example.com'}]];
  if(sql.includes('SELECT h.id,h.name'))return [homes];
  if(sql.includes('email_sender_identities'))return [[{id:88,from_email:'app@example.com'}]];
  if(sql.includes('SELECT title FROM family_entries'))return [entries.filter(e=>e.kind===params[1])];
  if(sql.includes('SELECT id,kind,title'))return [entries];
  if(sql.includes('SELECT user_id,display_name'))return [[{user_id:1,display_name:'Dad'}]];
  return [[]];
 });
});
describe('family email commands',()=>{
 it('keeps HTML-only item lines readable and removes a quoted old command',async()=>{
  const body=await extractFamilyEmailText({mimeType:'text/html',body:{data:Buffer.from('<div>Milk &amp; eggs</div><div>Bananas</div><blockquote>Add groceries: old item</blockquote>').toString('base64url')}});
  expect(parseFamilyEmail('Add groceries',body).items).toEqual(['Milk & eggs','Bananas']);
 });
 it('ignores text attachments and forwarded messages',async()=>{
  const part=(mimeType,text,extra={})=>({mimeType,body:{data:Buffer.from(text).toString('base64url')},...extra});
  expect(await extractFamilyEmailText({parts:[part('text/plain','Groceries'),part('text/plain','Add groceries: not a command',{filename:'note.txt'}),{mimeType:'message/rfc822',parts:[part('text/plain','Add groceries: forwarded')]}]})).toBe('Groceries');
 });

 it.each(['Grocery list','Can you send me my grocery list?','What’s on my grocery list?'])('reads %s',subject=>expect(parseFamilyEmail(subject,'')).toMatchObject({action:'read',section:'grocery'}));
 it('uses a reply command instead of replaying the old add subject',()=>expect(parseFamilyEmail('Re: Add groceries: milk','Family summary\n\nOn Tuesday Dad wrote:\n> Add groceries: milk')).toMatchObject({action:'read',section:'all'}));
 it('preserves multiline items and drops signatures and quoted messages',()=>expect(parseFamilyEmail('[Family #7] Add groceries','Milk\nEggs\n-- \nDad\n> Bread')).toMatchObject({householdId:7,items:['Milk','Eggs']}));
 it('deduplicates a batch and rejects oversized entries without truncating them',()=>{
  expect(parseFamilyEmail('Add groceries: Milk, milk; eggs','').items).toEqual(['milk','eggs']);
  expect(parseFamilyEmail('Add groceries: '+ 'x'.repeat(201),'').error).toBeTruthy();
  expect(parseFamilyEmail('Add groceries','').error).toBeTruthy();
 });
 it('leaves workplace tasks alone',()=>expect(parseFamilyEmail('Add task: payroll','')).toBe(null));
 it('matches new family to-dos',()=>expect(parseFamilyEmail('Add to-do: book the dentist','')).toMatchObject({section:'chore',items:['book the dentist']}));
 it('requires Google-authenticated aligned From; ignores Reply-To impersonation and forged lower headers',()=>{
  expect(authenticatedFamilySender(headers,'dad@example.com')).toBe(true);
  expect(authenticatedFamilySender(headers,'mom@example.com')).toBe(false);
  expect(authenticatedFamilySender([{name:'From',value:'dad@example.com'},{name:'Authentication-Results',value:'mx.google.com; dmarc=fail header.from=example.com'},headers[1]],'dad@example.com')).toBe(false);
  expect(authenticatedFamilySender([headers[0],{name:'Authentication-Results',value:'evil.com; dmarc=pass header.from=example.com'}],'dad@example.com')).toBe(false);
  expect(authenticatedFamilySender([headers[0],{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=evil.com'}],'dad@example.com')).toBe(false);
 });
 it('summarizes only unfinished current chore occurrences and upcoming family entries',()=>{
  const now=new Date('2026-09-16T18:00:00Z');
  const data={household:{id:7,name:'Home',timezone:'America/Denver'},members:[{user_id:1,display_name:'Dad'}],activity:[{entry_id:3,occurrence_key:'2026-09-16',state:'approved'}],entries:[{id:1,kind:'grocery',title:'Milk'},{id:2,kind:'grocery',title:'Bread',completed_at:now},{id:3,kind:'chore',title:'Dishes',metadata:{recurrence:'daily'}},{id:4,kind:'chore',title:'Laundry',member_user_id:1,metadata:{recurrence:'none'}},{id:5,kind:'event',title:'Soccer',start_at:'2026-09-17T18:00:00Z',end_at:'2026-09-17T19:00:00Z'},{id:6,kind:'event',title:'Old',start_at:'2026-09-14T18:00:00Z',end_at:'2026-09-14T19:00:00Z'}]};
  const text=familySummaryText(buildFamilySummary(data,now));
  expect(text).toContain('Milk');expect(text).toContain('Laundry — Dad');expect(text).toContain('Soccer');expect(text).not.toContain('Bread');expect(text).not.toContain('Dishes');expect(text).not.toContain('Old');
  data.activity[0].occurrence_key='2026-09-15';expect(familySummaryText(buildFamilySummary(data,now))).toContain('Dishes');
 });
 it('escapes all untrusted titles in HTML replies',()=>expect(familyEmailHtml('<img src=x onerror=alert(1)>')).not.toContain('<img'));
});
describe('private family command execution',()=>{
 it('does not query private data or send for unauthenticated mail',async()=>{const sendReply=vi.fn();expect(await handleFamilyEmailInbound({...input,headers:[],sendReply})).toMatchObject({ignored:true});expect(mocks.execute).not.toHaveBeenCalled();expect(sendReply).not.toHaveBeenCalled();});
 it('checks benefit and membership before data access or writes',async()=>{mocks.benefit.mockRejectedValue(Object.assign(new Error('Disabled'),{status:403}));await expect(getFamilyPocket({userId:1,agencyId:1},7)).rejects.toThrow('Disabled');await expect(addFamilyPocketItems({userId:1,agencyId:1},7,{kind:'grocery',items:['Milk']})).rejects.toThrow('Disabled');expect(mocks.save).not.toHaveBeenCalled();});
 it('adds privately and retries a failed reply without replaying the committed changes',async()=>{
  const sendReply=vi.fn().mockRejectedValueOnce(new Error('Gmail unavailable')).mockResolvedValueOnce({});
  await expect(handleFamilyEmailInbound({...input,sendReply})).rejects.toThrow('Gmail unavailable');expect(mocks.save).toHaveBeenCalledTimes(2);
  await expect(handleFamilyEmailInbound({...input,sendReply})).resolves.toMatchObject({replied:true});expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(sendReply.mock.calls[1][0]).toMatchObject({to:'dad@example.com',identity:{from_email:'app@example.com'}});
  expect((await handleFamilyEmailInbound({...input,sendReply})).reason).toBe('duplicate');expect(sendReply).toHaveBeenCalledTimes(2);
 });
 it('never guesses between households or accepts a foreign household ID',async()=>{homes=[{id:7,name:'Home'},{id:8,name:'Other'}];const sendReply=vi.fn();await handleFamilyEmailInbound({...input,subject:'[Family #99] Add groceries: milk',sendReply});expect(mocks.save).not.toHaveBeenCalled();expect(sendReply.mock.calls[0][0].text).toContain('Choose your household');});
 it('holds commands for retry when another replica is processing this sender',async()=>{const original=mocks.execute.getMockImplementation();mocks.execute.mockImplementation((sql,p)=>sql.includes('GET_LOCK')?Promise.resolve([[{acquired:0}]]):original(sql,p));expect(await handleFamilyEmailInbound(input)).toMatchObject({retry:true});expect(mocks.save).not.toHaveBeenCalled();});
 it('rolls back a batch and never confirms failed writes',async()=>{mocks.save.mockRejectedValueOnce(new Error('write failed'));const sendReply=vi.fn();await expect(handleFamilyEmailInbound({...input,sendReply})).rejects.toThrow('write failed');expect(mocks.rollback).toHaveBeenCalled();expect(mocks.commit).not.toHaveBeenCalled();expect(sendReply).not.toHaveBeenCalled();});
 it('requires a parent to add chores',async()=>{mocks.household.mockRejectedValue(Object.assign(new Error('Parent required'),{status:403}));await expect(addFamilyPocketItems({userId:1,agencyId:1},7,{kind:'chore',items:['Dentist']})).rejects.toThrow('Parent required');expect(mocks.household).toHaveBeenCalledWith(expect.anything(),7,expect.anything(),true);expect(mocks.save).not.toHaveBeenCalled();});
});
