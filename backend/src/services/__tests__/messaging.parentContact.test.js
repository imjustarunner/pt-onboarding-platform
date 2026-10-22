import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { emailParentContactOutcome } from '../parentContact.service.js';
const guardian={email:'parent@example.test',personal_email:'parent@example.test'};
const outbound={id:1,channel:'email',direction:'outbound',author_user_id:567,send_status:'sent',to_json:[{email:guardian.email}]};
const inbound={id:2,channel:'email',direction:'inbound',send_status:'sent',from_json:{email:guardian.email}};
describe('parent contact evidence',()=>{
 it('records a sent message as contacted and a human parent reply as successful',()=>{
  expect(emailParentContactOutcome(outbound,guardian)).toEqual({successful:false});
  expect(emailParentContactOutcome(inbound,guardian,[outbound])).toEqual({successful:true,authorId:567});
 });
 it.each(['preparing','queued','scheduled','cancelled','failed','sending'])('does not count %s mail as contact',send_status=>{
  expect(emailParentContactOutcome({...outbound,send_status},guardian)).toBeNull();
 });
 it('does not equate a delivery or read receipt with a parent reply',()=>{
  expect(emailParentContactOutcome({...outbound,send_status:'delivered'},guardian)).toEqual({successful:false});
  expect(emailParentContactOutcome({...inbound,is_auto_reply:1},guardian,[outbound])).toBeNull();
  expect(emailParentContactOutcome({...inbound,auto_reply_kind:'out_of_office'},guardian,[outbound])).toBeNull();
 });
 it('rejects another sender, internal notes and unrelated incoming mail',()=>{
  expect(emailParentContactOutcome({...inbound,from_json:{email:'other@example.test'}},guardian,[outbound])).toBeNull();
  expect(emailParentContactOutcome({...outbound,is_internal_note:1},guardian)).toBeNull();
  expect(emailParentContactOutcome(inbound,guardian,[])).toBeNull();
  expect(emailParentContactOutcome(inbound,guardian,[{...outbound,to_json:[{email:'someone@example.test'}]}])).toBeNull();
 });
});
