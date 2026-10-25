import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{hydrateBody:vi.fn(row=>row)}}));
import pool from '../../config/database.js';
import { listOwnQaEmails, readOwnQaEmail, isOwnQaEmail } from '../qaRecipientEmail.service.js';
const account={id:1434,agency_id:450,email:'qa.support.auricwell@example.com',feature_flags:{qaSandbox:{syntheticOnly:true}}};
const email={id:7,agency_id:450,channel:'email',recipient_address:account.email,subject:'Session reminder',delivery_status:'sent',body:'Private reminder',metadata:{deliveredTo:'testing@itsco.health'}};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValueOnce([[account]]).mockResolvedValueOnce([[{total:1}]]);});
it('lists original-recipient emails without exposing message bodies or claiming delivery',async()=>{
  pool.execute.mockResolvedValueOnce([[email,{...email,id:8,recipient_address:'qa.provider.auricwell@example.com'}]]);
  const result=await listOwnQaEmails({id:1434},{userId:1433,agencyId:2});
  expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({id:7,channel:'email',deliveryStatus:'sent',redirectedTo:'testing@itsco.health'});
  expect(result.items[0]).not.toHaveProperty('body');expect(pool.execute.mock.calls[0][1]).toEqual([1434,'auricwell-qa-demo']);
  expect(pool.execute.mock.calls[2][1]).toEqual([450,Number.MAX_SAFE_INTEGER,account.email,account.email]);
});
it.each(['qa.provider.auricwell@example.com','testing@itsco.health','prefixqa.support.auricwell@example.com'])('cannot open another recipient: %s',async recipient=>{
  pool.execute.mockResolvedValueOnce([[{...email,user_id:1434,recipient_address:recipient}]]);
  await expect(readOwnQaEmail({id:1434},7)).rejects.toMatchObject({status:404});
});
it('returns the authenticated recipient body only',async()=>{pool.execute.mockResolvedValueOnce([[email]]);expect(await readOwnQaEmail({id:1434},7)).toMatchObject({body:'Private reminder'});});
it('does not trust a receipt from another agency or channel',()=>{
  expect(isOwnQaEmail({...email,agency_id:2},account)).toBe(false);expect(isOwnQaEmail({...email,channel:'sms'},account)).toBe(false);
});
it('accepts display-name and multiple To addresses without substring matching',()=>{
  expect(isOwnQaEmail({...email,recipient_address:`Other <other@example.com>, Jordan <${account.email.toUpperCase()}>`},account)).toBe(true);
});
it('includes a redirected Cc/Bcc recipient from the sender receipt, but not an untrusted metadata field',()=>{
  const row={...email,recipient_address:'other@example.com',metadata:{testInboxRedirect:true,originalTo:`other@example.com, ${account.email}`}};
  expect(isOwnQaEmail(row,account)).toBe(true);
  expect(isOwnQaEmail({...row,metadata:{originalTo:account.email}},account)).toBe(false);
});
it.each([null,{...account,email:'real@company.test'},{...account,feature_flags:'{broken}'},{...account,feature_flags:{}}])('fails closed for non-QA or malformed identity configuration',async invalid=>{
  pool.execute.mockReset().mockResolvedValueOnce([[invalid].filter(Boolean)]);
  await expect(listOwnQaEmails({id:1434})).rejects.toMatchObject({status:404});expect(pool.execute).toHaveBeenCalledTimes(1);
});
it('rejects ambiguous shared addresses',async()=>{
  pool.execute.mockReset().mockResolvedValueOnce([[account]]).mockResolvedValueOnce([[{total:2}]]);
  await expect(listOwnQaEmails({id:1434})).rejects.toMatchObject({status:404});
});
it('retains failed and held statuses for actionable checks',async()=>{
  pool.execute.mockResolvedValueOnce([[{...email,delivery_status:'failed'},{...email,id:9,delivery_status:'pending_approval'}]]);
  expect((await listOwnQaEmails({id:1434})).items.map(e=>e.deliveryStatus)).toEqual(['failed','pending_approval']);
});
