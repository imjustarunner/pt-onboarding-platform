import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),release:vi.fn(),benefit:vi.fn(),household:vi.fn(),recipients:vi.fn(),identity:vi.fn(),pocket:vi.fn(),send:vi.fn(),find:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:mocks.execute,release:mocks.release})}}));
vi.mock('../familyAuth.service.js',async()=>{const {createHash}=await import('node:crypto');return {assertFamilyBenefit:mocks.benefit,requireHousehold:mocks.household,familyHash:x=>createHash('sha256').update(x).digest('hex')};});
vi.mock('../familyEmail.service.js',()=>({getFamilyPocket:mocks.pocket,getFamilyDeliveryIdentity:mocks.identity,getFamilyEmailRecipients:mocks.recipients,sendFamilyEmailReply:mocks.send}));
import {normalizeFamilyDelivery,sendFamilyPocketEmail} from '../familyPocketDelivery.service.js';
const session={userId:1,agencyId:9},body={to:'mom@example.com',sections:['grocery','upcoming'],requestId:'f7fa44a1-89b7-412b-92ed-ef3a163a0e80'};
const send=(override={},data=body)=>sendFamilyPocketEmail(session,7,data,{send:mocks.send,findSent:mocks.find,...override});
let row;
beforeEach(()=>{
 vi.clearAllMocks();row=null;
 mocks.benefit.mockResolvedValue();mocks.household.mockResolvedValue({id:7,role:'parent'});
 mocks.identity.mockResolvedValue({id:1,from_email:'app@example.com'});mocks.recipients.mockResolvedValue([{userId:2,name:'Mom',email:'mom@example.com'}]);
 mocks.send.mockResolvedValue('sent-id');mocks.find.mockResolvedValue(null);
 mocks.pocket.mockResolvedValue({name:'Our family',timezone:'America/Denver',generatedAt:'2026-09-22T18:00:00Z',url:'https://example.com/family',sections:[{key:'grocery',title:'Groceries',items:[{title:'Fresh milk'}]},{key:'chore',title:'Chores',items:[{title:'Private chore'}]},{key:'upcoming',title:'Upcoming',items:[{title:'Soccer'}]}]});
 mocks.execute.mockImplementation(async(sql,p)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT * FROM family_email_requests'))return [row?[row]:[]];
  if(sql.includes('SELECT COUNT'))return [[{count:0}]];
  if(sql.startsWith('INSERT INTO family_email_requests')){row={result_json:p[4],applied_at:new Date()};return [{}];}
  if(sql.includes('SET replied_at')){row.replied_at=new Date();return [{}];}
  if(sql.startsWith('DELETE')){row=null;return [{}];}
  return [[]];
 });
});
describe('direct family email delivery',()=>{
 it('normalizes choices and rejects address lists, injection, invalid sections and keys',()=>{
  expect(normalizeFamilyDelivery({...body,to:' MOM@example.com ',sections:['upcoming','grocery','grocery']})).toMatchObject({to:'mom@example.com',sections:['grocery','upcoming']});
  for(const to of ['a@example.com,b@example.com','a@example.com\r\nBcc: b@example.com','a@members.invalid','bad','Name <a@example.com>'])expect(()=>normalizeFamilyDelivery({...body,to})).toThrow();
  for(const sections of [[],['work'],['grocery','client']])expect(()=>normalizeFamilyDelivery({...body,sections})).toThrow();
  expect(()=>normalizeFamilyDelivery({...body,requestId:'short'})).toThrow();
 });
 it('sends only selected fresh sections directly to the chosen address',async()=>{
  expect(await send()).toMatchObject({sent:true,to:'mom@example.com'});
  const args=mocks.send.mock.calls[0][0];expect(args.text).toContain('Fresh milk');expect(args.text).toContain('Soccer');expect(args.text).not.toContain('Private chore');
  expect(args).toMatchObject({actorUserId:1,automaticReply:false,to:'mom@example.com',householdId:7});
  expect(mocks.identity).toHaveBeenCalledWith(9);expect(mocks.pocket).toHaveBeenCalledWith(session,7,expect.anything());
 });
 it('authorizes membership and benefit before reading recipients or sending',async()=>{
  mocks.household.mockRejectedValueOnce(new Error('Not your household'));
  await expect(send()).rejects.toThrow('Not your household');expect(mocks.recipients).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  mocks.benefit.mockRejectedValue(new Error('Disabled'));await expect(send()).rejects.toThrow('Disabled');
 });
 it('allows a parent to enter a personal email, but restricts a non-parent to linked family accounts',async()=>{
  await send({}, {...body,to:'personal@gmail.com'});expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({to:'personal@gmail.com'}));
  mocks.household.mockResolvedValue({role:'member'});await expect(send({}, {...body,to:'other@gmail.com'})).rejects.toMatchObject({status:403});
 });
 it('deduplicates repeated clicks and rejects different payloads on the same request',async()=>{
  await send();expect(await send()).toMatchObject({sent:true,duplicate:true});expect(mocks.send).toHaveBeenCalledTimes(1);
  await expect(send({}, {...body,sections:['chore']})).rejects.toMatchObject({status:409});expect(mocks.send).toHaveBeenCalledTimes(1);
 });
 it('reconciles an uncertain Gmail response without sending a second message',async()=>{
  mocks.send.mockRejectedValueOnce(new Error('connection reset'));await expect(send()).rejects.toMatchObject({status:503});
  await expect(send()).rejects.toMatchObject({status:409});expect(mocks.send).toHaveBeenCalledTimes(1);
  mocks.find.mockResolvedValue('gmail-message-id');expect(await send()).toMatchObject({sent:true,duplicate:true});expect(mocks.send).toHaveBeenCalledTimes(1);
 });
 it('allows retry after a confirmed pre-send failure',async()=>{
  mocks.send.mockRejectedValueOnce(Object.assign(new Error('Sender unavailable'),{deliveryStarted:false}));
  await expect(send()).rejects.toMatchObject({status:503});expect(row).toBe(null);
  expect(await send()).toMatchObject({sent:true});
 });
 it('enforces sender availability, hourly limits and concurrent send protection',async()=>{
  mocks.identity.mockResolvedValueOnce(null);await expect(send()).rejects.toMatchObject({status:503});
  const original=mocks.execute.getMockImplementation();mocks.execute.mockImplementation((sql,p)=>sql.includes('SELECT COUNT')?Promise.resolve([[{count:20}]]):original(sql,p));
  await expect(send()).rejects.toMatchObject({status:429});expect(mocks.send).not.toHaveBeenCalled();
  mocks.execute.mockImplementation((sql,p)=>sql.includes('GET_LOCK')?Promise.resolve([[{acquired:0}]]):original(sql,p));
  await expect(send()).rejects.toMatchObject({status:409});expect(mocks.send).not.toHaveBeenCalled();
 });
});
