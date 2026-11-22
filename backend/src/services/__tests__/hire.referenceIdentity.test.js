import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({identity:vi.fn(),agency:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:mocks.identity}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:mocks.agency}}));
import {resolveHiringReferenceReplyTo} from '../hiringReferenceIdentity.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.identity.mockResolvedValue(null);mocks.agency.mockResolvedValue({});});
describe('company People Operations replies',()=>{
 it('uses the company PO mailbox with the shared reference sender',async()=>{
  mocks.identity.mockResolvedValue({from_email:'po@agency.test'});
  expect(await resolveHiringReferenceReplyTo(2,{reply_to:'references@plotlinepo.com'})).toBe('po@agency.test');
 });
 it('uses the configured company team address when there is no PO sender row',async()=>{
  mocks.agency.mockResolvedValue({onboarding_team_email:'people@agency.test'});
  expect(await resolveHiringReferenceReplyTo(2)).toBe('people@agency.test');
 });
 it('requires a real-company reply route and redirects demo replies to QA',async()=>{
  expect(await resolveHiringReferenceReplyTo(2,{reply_to:'references@plotlinepo.com'})).toBeNull();
  mocks.agency.mockResolvedValue({is_demo:1});
  expect(await resolveHiringReferenceReplyTo(463)).toBe('testing@itsco.health');
 });
});
