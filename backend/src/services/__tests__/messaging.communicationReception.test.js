vi.mock('../sharedCareNumber.service.js',()=>({sharedCareNumberId:vi.fn()}));
vi.mock('../communicationRouting.service.js',()=>({resolveClientCaregivers:vi.fn()}));
import {sharedCareNumberId} from '../sharedCareNumber.service.js';
import {resolveClientCaregivers} from '../communicationRouting.service.js';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { isCommunicationStaffActive,receptionReason,isLikelyAdvertising } from '../../utils/communicationReceptionPolicy.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{findByPhoneNumber:vi.fn()}}));
vi.mock('../../models/AgencyContact.model.js',()=>({default:{findByPhone:vi.fn()}}));
vi.mock('../smsProfileAudit.service.js',()=>({resolveProfilePhoneMatch:vi.fn()}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(),decryptChatText:vi.fn()}));
import pool from '../../config/database.js';
import PhoneNumber from '../../models/PhoneNumber.model.js';
import AgencyContact from '../../models/AgencyContact.model.js';
import {resolveProfilePhoneMatch} from '../smsProfileAudit.service.js';
import {encryptChatText} from '../chatEncryption.service.js';
import { inspectInboundReception,enqueueCommunicationReview,reviewCommunication } from '../communicationReview.service.js';

beforeEach(()=>{vi.resetAllMocks();sharedCareNumberId.mockResolvedValue(null);PhoneNumber.findByPhoneNumber.mockResolvedValue({id:9,agency_id:2,number_purpose:'clinical_care'});pool.execute.mockResolvedValue([[]]);resolveProfilePhoneMatch.mockResolvedValue({clients:[]});AgencyContact.findByPhone.mockResolvedValue(null);});
describe('staff eligibility',()=>{
 it.each([{status:'TERMINATED_PENDING'},{status:'ARCHIVED'},{is_active:0},{is_archived:1},{terminated_at:new Date()}])('never routes to departed/inactive staff %j',user=>expect(isCommunicationStaffActive(user)).toBe(false));
 it('accepts active staff',()=>expect(isCommunicationStaffActive({status:'ACTIVE_EMPLOYEE',is_active:1})).toBe(true));
});
describe('inbound reception',()=>{
 it('keeps unknown separate from known and blocked',()=>{expect(receptionReason({})).toBe('unknown_sender');expect(receptionReason({known:true})).toBe(null);expect(receptionReason({known:true,blocked:true})).toBe('blocked_sender');});
 it('holds unknown senders before clinician routing',async()=>expect(await inspectInboundReception({from:'+13035550101',to:'+13035550100'})).toMatchObject({reason:'unknown_sender'}));
 it('never queries identity for blocked senders',async()=>{pool.execute.mockResolvedValueOnce([[{exists:1}]]);expect(await inspectInboundReception({from:'+13035550101',to:'+13035550100'})).toMatchObject({reason:'blocked_sender'});expect(resolveProfilePhoneMatch).not.toHaveBeenCalled();});
 it('holds shared guardian phones for identification',async()=>{resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1},{id:2}]});expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'ambiguous_identity'});});
 it('keeps terminated provider numbers with support indefinitely',async()=>{resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1}]});pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:8,membership_active:1,status:'TERMINATED_PENDING',terminated_at:'2020-01-01'}]]);expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'departed_provider'});});
 it('does not hand another provider a known client',async()=>{resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1}]});pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:8,role:'provider',membership_active:1,status:'ACTIVE_EMPLOYEE',is_active:1}]]).mockResolvedValueOnce([[]]);expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'unapproved_for_provider'});});
 it('holds main-number inquiries for support',async()=>{PhoneNumber.findByPhoneNumber.mockResolvedValue({id:9,agency_id:2,number_purpose:'tenant_contact'});AgencyContact.findByPhone.mockResolvedValue({id:3});expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'main_number_inquiry'});});
 it('only classifies narrow advertising patterns',()=>{expect(isLikelyAdvertising('We offer SEO services to improve your Google rankings')).toBe(true);expect(isLikelyAdvertising('Can you send me the appointment link?')).toBe(false);expect(isLikelyAdvertising('I saw an ad for your therapy services')).toBe(false);});
 it('classifies ads from unknown senders without blocking known families',async()=>{const input={from:'x',to:'y',body:'We offer SEO services'};expect(await inspectInboundReception(input)).toMatchObject({reason:'suspected_advertising'});resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1}]});expect(await inspectInboundReception(input)).toMatchObject({reason:null});});
});
describe('review storage and access',()=>{
 it('fails closed if encryption unavailable',async()=>{encryptChatText.mockImplementation(()=>{throw Error('missing encryption');});await expect(enqueueCommunicationReview({agencyId:2,body:'private'})).rejects.toThrow();expect(pool.execute).not.toHaveBeenCalled();});
 it('stores ciphertext with idempotent provider message ID',async()=>{encryptChatText.mockReturnValue({ciphertextB64:'cipher',ivB64:'iv',authTagB64:'tag',keyId:'v1'});pool.execute.mockResolvedValue([{insertId:7}]);await enqueueCommunicationReview({agencyId:2,externalId:'provider-id',reason:'unknown_sender',body:'private'});const [sql,params]=pool.execute.mock.calls[0];expect(sql).toContain('ON DUPLICATE KEY');expect(params).toContain('provider-id');expect(params).toContain('cipher');expect(params).not.toContain('private');});
 it('does not mutate review rows from another agency',async()=>{const conn={beginTransaction:vi.fn(),execute:vi.fn().mockResolvedValue([[]]),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(conn);await expect(reviewCommunication({agencyId:3,id:7,action:'block',userId:1})).rejects.toMatchObject({status:404});expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=?'),[7,3]);expect(conn.execute).toHaveBeenCalledTimes(1);expect(conn.rollback).toHaveBeenCalled();});
});

import { requireCommunicationReviewer } from '../../controllers/communicationReview.controller.js';
vi.mock('../auditEvent.service.js',()=>({logAuditEvent:vi.fn()}));
describe('reviewer tenant authorization',()=>{
 const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
 it('denies another agency even to support staff',async()=>{const response=res(),next=vi.fn();pool.execute.mockResolvedValue([[]]);await requireCommunicationReviewer({user:{id:5,role:'support'},params:{agencyId:'2'}},response,next);expect(response.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();expect(pool.execute.mock.calls[0][1]).toEqual([5,2]);});
 it('denies ordinary providers',async()=>{const response=res();await requireCommunicationReviewer({user:{id:5,role:'provider'},params:{agencyId:'2'}},response,vi.fn());expect(response.status).toHaveBeenCalledWith(403);expect(pool.execute).not.toHaveBeenCalled();});
 it('permits current support membership',async()=>{pool.execute.mockResolvedValue([[{id:5,is_active:1,status:'ACTIVE_EMPLOYEE'}]]);const next=vi.fn();await requireCommunicationReviewer({user:{id:5,role:'support'},params:{agencyId:'2'}},res(),next);expect(next).toHaveBeenCalledWith();});
});

describe('shared care line reception',()=>{
 it('ignores individual number assignments when the client has a current care team',async()=>{
  sharedCareNumberId.mockResolvedValue(9);resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1}]});
  resolveClientCaregivers.mockResolvedValue({ownerUserId:8,caregiverIds:[8]});
  pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:99,role:'provider',membership_active:1,status:'TERMINATED_PENDING'}]]);
  expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:null});
 });
 it('holds a known client without an active care assignment for support',async()=>{
  sharedCareNumberId.mockResolvedValue(9);resolveProfilePhoneMatch.mockResolvedValue({clientId:1,clients:[{id:1}]});
  resolveClientCaregivers.mockResolvedValue({ownerUserId:null,caregiverIds:[]});
  expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'unassigned_client'});
 });
 it('sends other known contacts to support instead of a provider pool',async()=>{
  sharedCareNumberId.mockResolvedValue(9);AgencyContact.findByPhone.mockResolvedValue({id:2});
  expect(await inspectInboundReception({from:'x',to:'y'})).toMatchObject({reason:'unlinked_sender'});
 });
});
