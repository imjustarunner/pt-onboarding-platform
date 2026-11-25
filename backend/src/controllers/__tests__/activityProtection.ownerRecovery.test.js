import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),state:vi.fn(),primary:vi.fn(),append:vi.fn(),mirror:vi.fn(),rollback:vi.fn(),commit:vi.fn(),rows:[],held:true,pending:true,failAudit:false}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.execute(...args),getConnection:()=>m.connection()}}));
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:(...args)=>m.state(...args),primaryProof:(...args)=>m.primary(...args),requireAccountSession:vi.fn()}));
vi.mock('../../services/securityEvidence.service.js',()=>({appendSecurityEvidence:(...args)=>m.append(...args),mirrorSecurityEvidence:(...args)=>m.mirror(...args)}));
import { reviewTicket, pendingFileRequests } from '../activityProtection.controller.js';
import { soleReviewerRecoveryAllowed } from '../../services/solePrivacyReviewerRecovery.service.js';
const reviewer=(id=1,role='super_admin',extra={})=>({user_id:id,role,is_active:1,is_archived:0,status:'ACTIVE',revoked_at:null,...extra});
const request=()=>({user:{id:1,role:'super_admin',sessionId:'real-user-session'},sessionSecurity:{key:'key-1'},authClaims:{authMethod:'google',iat:Date.now()/1000},params:{id:'ticket-1'},body:{decision:'reset',note:'I reviewed the file activity and need to continue routine work.',soleReviewerRecovery:true,confirmOwnFileAccess:true}});
async function invoke(req=request()) {let error;const res={json:vi.fn(),setHeader:vi.fn()};await reviewTicket(req,res,e=>{error=e;});if(error)throw error;return res.json.mock.calls[0]?.[0];}
beforeEach(()=>{
 vi.clearAllMocks();m.rows=[reviewer()];m.held=true;m.pending=true;m.failAudit=false;
 m.state.mockResolvedValue({required:false,verified:true});m.primary.mockResolvedValue(undefined);
 m.append.mockImplementation(async()=>{if(m.failAudit)throw new Error('Audit unavailable');return 'event-1';});
 m.execute.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT user_id FROM activity_protection_tickets'))return [[{user_id:1}]];
  if(sql.includes('FROM privacy_reviewers p JOIN users'))return [m.rows];
  if(sql.startsWith('SELECT held_at'))return [[{held_at:m.held?'2026-11-24T16:00:00Z':null}]];
  if(sql.includes('reviewed_at reset_at'))return [[]];
  if(sql.startsWith('SELECT * FROM activity_protection_tickets'))return [m.pending?[{id:'ticket-1',user_id:1,requested_units:1}]:[]];
  if(sql.startsWith('SELECT verified_at,device_id'))return [[{verified_at:new Date(),device_id:null}]];
  if(sql.includes('SELECT t.id,t.user_id'))return [[{id:'ticket-1',user_id:1,held_at:new Date(),hold_reason:'volume_limit'}]];
  return [{affectedRows:1}];
 });
 m.connection.mockResolvedValue({execute:(...args)=>m.execute(...args),beginTransaction:vi.fn(),commit:m.commit,rollback:m.rollback,release:vi.fn()});
});
it('restores only the sole owner’s file hold after fresh verification and records explicit recovery evidence',async()=>{
 expect(await invoke()).toEqual({reviewed:true,decision:'reset'});
 expect(m.primary).toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('ORDER BY p.user_id FOR UPDATE'));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("SET held_at=NULL WHERE user_id=? AND kind='client_file'"),[1]);
 expect(m.execute.mock.calls.some(([sql])=>/DELETE|kind='email'|UPDATE privacy_reviewers/.test(sql))).toBe(false);
 expect(m.append).toHaveBeenCalledWith(expect.objectContaining({userId:1,action:'sole_reviewer_file_access_recovery',details:expect.objectContaining({soleReviewerRecovery:true,reviewerCount:1,usageWindowReset:true,verificationMethod:'recent_google_sign_in'})}),expect.anything(),{mirror:false});
 expect(m.commit).toHaveBeenCalledTimes(1);
});
it.each([
 ['second active reviewer',[reviewer(),reviewer(2,'support')]],
 ['sole admin rather than platform owner',[reviewer(1,'admin')]],
 ['revoked owner',[reviewer(1,'super_admin',{revoked_at:new Date()})]],
 ['inactive owner',[reviewer(1,'super_admin',{is_active:0})]],
 ['no designated reviewer',[]]
])('refuses self-recovery with %s',async(_label,rows)=>{
 m.rows=rows;await expect(invoke()).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');expect(m.commit).not.toHaveBeenCalled();expect(m.rollback).toHaveBeenCalled();
});
it('does not count revoked or inactive reviewers as a workable second reviewer',()=>{
 expect(soleReviewerRecoveryAllowed(1,[reviewer(),reviewer(2,'admin',{is_active:0}),reviewer(3,'support',{revoked_at:new Date()})])).toBe(true);
});
it.each([{decision:'approved',units:20},{soleReviewerRecovery:false},{confirmOwnFileAccess:false},{note:'Too short note'},{switched:true}])('requires the explicit own-file reset path %j',async(change)=>{
 const req=request();Object.assign(req.body,change);if(change.switched)req.user.switchedFromUserId=2;
 await expect(invoke(req)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');expect(m.append).not.toHaveBeenCalled();
});
it('keeps the hold when fresh Google verification and authenticator verification are unavailable',async()=>{
 m.primary.mockRejectedValue(Object.assign(new Error('Sign in again'),{code:'PRIMARY_VERIFICATION_REQUIRED'}));
 m.state.mockResolvedValue({required:false,verified:false});
 await expect(invoke()).rejects.toHaveProperty('code','MFA_FRESH_REQUIRED');expect(m.connection).not.toHaveBeenCalled();
});
it('accepts a fresh authenticator for an older Google sign-in, while rejecting remembered-device proof',async()=>{
 m.primary.mockRejectedValue(Object.assign(new Error('Sign in again'),{code:'PRIMARY_VERIFICATION_REQUIRED'}));
 expect(await invoke()).toMatchObject({reviewed:true});
 expect(m.append.mock.calls[0][0].details.verificationMethod).toBe('fresh_authenticator');
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,...args)=>sql.startsWith('SELECT verified_at,device_id')?Promise.resolve([[{verified_at:new Date(),device_id:'remembered-device'}]]):base(sql,...args));
 await expect(invoke()).rejects.toHaveProperty('code','MFA_FRESH_REQUIRED');
});
it('does not replay a completed request or clear a missing hold',async()=>{
 m.pending=false;await expect(invoke()).rejects.toThrow('already been reviewed');
 m.pending=true;m.held=false;await expect(invoke()).rejects.toHaveProperty('code','NO_FILE_HOLD');
});
it('rejects an owner-recovery form after the signed-in account changes',async()=>{
 const req=request();req.user.id=2;
 await expect(invoke(req)).rejects.toHaveProperty('code','ACCOUNT_CHANGED');expect(m.connection).not.toHaveBeenCalled();
});
it('rolls back the recovery if the audit event cannot be recorded',async()=>{
 m.failAudit=true;await expect(invoke()).rejects.toThrow('Audit unavailable');expect(m.rollback).toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();
});
it('returns eligibility and the recorded hold reason to the authenticated review screen',async()=>{
 const res={json:vi.fn(),setHeader:vi.fn()},next=vi.fn();await pendingFileRequests(request(),res,next);
 expect(res.json).toHaveBeenCalledWith({tickets:[expect.objectContaining({hold_reason:'volume_limit'})],selfRecoveryAllowed:true});
 expect(next).not.toHaveBeenCalled();
});

it('accepts fresh Google verification without requiring an additional authenticator during MFA rollout',async()=>{
 m.state.mockResolvedValue({required:true,verified:false});expect(await invoke()).toEqual({reviewed:true,decision:'reset'});expect(m.primary).toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('SELECT verified_at,device_id'))).toBe(false);
});

it.each(['invalid','2000-01-01T00:00:00Z','2099-01-01T00:00:00Z'])('rejects invalid, stale, or future authenticator timestamps (%s)',async verified_at=>{
 const req=request();delete req.authClaims;
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,...args)=>sql.startsWith('SELECT verified_at,device_id')?Promise.resolve([[{verified_at,device_id:null}]]):base(sql,...args));
 await expect(invoke(req)).rejects.toHaveProperty('code','MFA_FRESH_REQUIRED');expect(m.connection).not.toHaveBeenCalled();
});
