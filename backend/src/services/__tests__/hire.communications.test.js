import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getSender:vi.fn(),resolveSender:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute},onTableWrite:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:mocks.resolveSender,getSmsSender:mocks.getSender}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
vi.mock('../email.service.js',()=>({default:{sendEmail:vi.fn()}}));
import {validateHiringChoice} from '../hiringCommunication.service.js';
import {buildSmsConsentDisclosure} from '../../utils/smsConsentDisclosure.js';
import {hiringSnapshotEvents,queueHiringNotification} from '../hiringNotification.service.js';
const registration={brandName:'Test organization',legalName:'Test legal',purposes:['workforce','polling','marketing'],supportContact:'Help',termsUrl:'https://example.com/terms',privacyUrl:'https://example.com/privacy'};
const disclosure=buildSmsConsentDisclosure(registration,{signerRole:'staff',enrollmentCategory:'hiring'});
const context={available:true,disclosure,disclosureHash:'hash'};
const signed={channel:'email_sms',phone:'7195550123',signerName:'Test Person',authorityAccepted:true,electronicSignatureAccepted:true,disclosureHash:'hash'};
beforeEach(()=>{vi.clearAllMocks();mocks.execute.mockResolvedValue([{affectedRows:1}]);});
describe('separate optional hiring communications',()=>{
 it('defaults to email without requiring a phone, signature or configured sender',()=>expect(validateHiringChoice(undefined,{available:false})).toEqual({channel:'email',phone:null}));
 it('limits the hiring disclosure to hiring messages, without staff polls or marketing',()=>{expect(disclosure.enrollmentCategory).toBe('hiring');expect(disclosure.purposes.map(p=>p.purpose)).toEqual(['workforce']);expect(disclosure.text).toContain('not a condition of applying or employment');});
 it('accepts signed email and text, normalizing the phone',()=>expect(validateHiringChoice(signed,context)).toEqual({channel:'email_sms',phone:'+17195550123'}));
 it.each([{authorityAccepted:false},{electronicSignatureAccepted:false},{disclosureHash:'stale'},{phone:'bad'},{signerName:''}])('rejects incomplete or stale enrollment %j',change=>expect(()=>validateHiringChoice({...signed,...change},context)).toThrow());
 it('cannot enroll when the program is unavailable',()=>expect(()=>validateHiringChoice(signed,{available:false})).toThrow('not available'));
 it('creates durable event keys for duplicate-safe dispatch without changing existing preferences',async()=>{
  await queueHiringNotification({userId:8,agencyId:2,key:'onboarding_complete',type:'onboarding_complete'});
  expect(mocks.execute.mock.calls[0][0]).toContain('INSERT IGNORE');expect(mocks.execute.mock.calls[1][1]).toEqual([8,2,'onboarding_complete','onboarding_complete','pending','pending']);
 });
 it('retains an explicit staff choice not to send a transition notification',async()=>{
  await queueHiringNotification({userId:8,agencyId:2,key:'onboarding_started',type:'onboarding_started',skipDelivery:true});
  expect(mocks.execute.mock.calls[1][1].slice(-2)).toEqual(['handled','skipped']);
 });
 it('does not send old items on first observation or repeated observation',()=>{
  const current={steps:{pre_hire:[{key:'doc-1',kind:'document'}]}};
  expect(hiringSnapshotEvents(null,current)).toEqual([]);expect(hiringSnapshotEvents(current,current)).toEqual([]);
 });
 it('identifies added documents, training and completion without exposing titles',()=>{
  const previous={steps:{pre_hire:[{key:'profile'}]}};
  const current={prehireCompletedAt:'2026-10-09',steps:{pre_hire:[{key:'profile'},{key:'doc-2',kind:'document'},{key:'task-3',taskType:'training'}]}};
  expect(hiringSnapshotEvents(previous,current)).toEqual([{key:'prehire_complete',type:'prehire_complete'},{key:'pre_hire:doc-2',type:'document_added'},{key:'pre_hire:task-3',type:'training_added'}]);
 });
 it('announces the onboarding package once instead of each initial task',()=>{
  const previous={steps:{onboarding:[{key:'account'}]}};
  const current={onboardingStartedAt:'2026-10-09',steps:{onboarding:[{key:'account'},{key:'task-1',taskType:'document'}]}};
  expect(hiringSnapshotEvents(previous,current)).toEqual([{key:'onboarding_started',type:'onboarding_started'}]);
 });
});
