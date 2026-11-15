import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),generatePasswordlessToken:vi.fn()}}));
vi.mock('../guardianClinicalAccess.service.js',()=>({ageOn:vi.fn(),requireClinicalScope:vi.fn()}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../clientServiceEnrollment.service.js',()=>({clientAgencyMembership:vi.fn()}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn(),sendClientPortalEmail:vi.fn()}));
import {clientEmailContext,sendClientPortalEmail} from '../clientPortalEmail.service.js';
import pool from '../../config/database.js';import User from '../../models/User.model.js';
import {ageOn,requireClinicalScope} from '../guardianClinicalAccess.service.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';import {clientAgencyMembership} from '../clientServiceEnrollment.service.js';
import {parentDependentAccess,inviteDependent,resendDependentInvitation,staffDependentSharing,revokeDependentInvitation,staffDependentInvitationAccess,staffDependentInvitationStatus} from '../dependentPortalInvitations.service.js';
const parent={id:8,agency_id:2,relationship_type:'guardian',access_enabled:1,permissions_json:{},client_type:'clinical'};
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockResolvedValue([[parent]]);ageOn.mockReturnValue(14);requireClinicalScope.mockResolvedValue({});});
it.each([{...parent,access_enabled:0},{...parent,relationship_type:'self'},{...parent,permissions_json:{noView:true}},{...parent,permissions_json:{coGuardianInviteRestricted:true}}])('rejects a relationship without invitation authority',async row=>{pool.execute.mockResolvedValue([[row]]);await expect(parentDependentAccess(3,8)).rejects.toMatchObject({status:403});});
it.each([null,18,22,-1])('requires a known minor birth date',async age=>{ageOn.mockReturnValue(age);await expect(parentDependentAccess(3,8)).rejects.toMatchObject({status:409});});
it('requires the parent’s clinical access before inviting a counseling client',async()=>{requireClinicalScope.mockRejectedValue(Object.assign(new Error(),{status:403}));await expect(parentDependentAccess(3,8)).rejects.toMatchObject({status:403});});
it('does not merge an existing email into a child login',async()=>{const db={execute:vi.fn(async sql=>sql.includes('SELECT c.*')?[[parent]]:sql.includes('LOWER(email)')?[[{id:99}]]:[[]]),beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);await expect(inviteDependent({userId:3,clientId:8,email:'parent@example.com',confirmed:true})).rejects.toMatchObject({status:409});expect(db.execute.mock.calls.some(([q])=>q.includes('INSERT INTO users'))).toBe(false);expect(db.rollback).toHaveBeenCalled();});
it('rejects an unconfirmed invitation before changing any account',async()=>{await expect(inviteDependent({userId:3,clientId:8,email:'child@example.com'})).rejects.toMatchObject({status:400});expect(pool.getConnection).not.toHaveBeenCalled();});
it('deduplicates invitation sends before replacing the setup token',async()=>{const db={execute:vi.fn(async q=>q.includes('SELECT c.*')?[[parent]]:q.startsWith('SELECT d.')?[[{user_id:12,email:'child@example.com'}]]:q.startsWith('UPDATE')?[{affectedRows:0}]:[[]]),beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);await expect(resendDependentInvitation({userId:3,clientId:8})).rejects.toMatchObject({status:429});expect(User.generatePasswordlessToken).not.toHaveBeenCalled();});
it('rejects sharing into an unrelated tenant even for an administrator',async()=>{resolveClientRecordAccess.mockResolvedValue({ok:true});clientAgencyMembership.mockResolvedValue(false);await expect(staffDependentSharing({id:1,role:'super_admin'},8,{agencyId:9,scopes:['treatment_plan'],reviewed:true})).rejects.toMatchObject({status:403});});
it('revokes active sessions and unused setup links as well as the profile link',async()=>{const db={execute:vi.fn(async q=>q.includes('SELECT c.*')?[[parent]]:q.startsWith('SELECT')?[[{user_id:12}]]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);await revokeDependentInvitation({userId:3,clientId:8});const sql=db.execute.mock.calls.map(([q])=>q).join('\n');expect(sql).toContain('passwordless_token=NULL');expect(sql).toContain('UPDATE auth_session_security');expect(sql).toContain('access_enabled=0');expect(db.commit).toHaveBeenCalled();});

it('rechecks guardian authority under the transition lock before issuing a new reset link',async()=>{const db={execute:vi.fn(async q=>q.includes('SELECT c.*')?[[{...parent,access_enabled:0}]]:[[]]),beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);await expect(resendDependentInvitation({userId:3,clientId:8})).rejects.toMatchObject({status:403});expect(User.generatePasswordlessToken).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();});

const staff={id:30,role:'support'};
function staffAccessDb(){return {execute:vi.fn(async sql=>sql.includes('FROM user_agencies')?[[{user_id:30}]]:sql.includes('SELECT * FROM clients')?[[{id:8,agency_id:2,date_of_birth:'2010-04-10',full_name:'Fictional Teen'}]]:[[]])};}
function authorizeStaff(){resolveClientRecordAccess.mockResolvedValue({ok:true});clientAgencyMembership.mockResolvedValue(true);}
it('lets agency support invite a 16-year-old without borrowing a guardian identity',async()=>{authorizeStaff();ageOn.mockReturnValue(16);const db=staffAccessDb();const client=await staffDependentInvitationAccess(staff,8,2,db);expect(client.id).toBe(8);expect(resolveClientRecordAccess).toHaveBeenCalledWith({userId:30,role:'support',clientId:8});expect(requireClinicalScope).not.toHaveBeenCalled();});
it.each(['provider','client_guardian','school_staff','client'])('rejects %s from the staff invitation path',async role=>{await expect(staffDependentInvitationAccess({id:30,role},8,2)).rejects.toMatchObject({status:403});expect(pool.getConnection).not.toHaveBeenCalled();});
it('rejects an agency outside the client affiliations',async()=>{authorizeStaff();clientAgencyMembership.mockResolvedValue(false);await expect(staffDependentInvitationAccess(staff,8,9,staffAccessDb())).rejects.toMatchObject({status:403});});
it('rechecks active staff membership rather than relying only on chart visibility',async()=>{authorizeStaff();const db=staffAccessDb();db.execute.mockResolvedValueOnce([[]]);await expect(staffDependentInvitationAccess(staff,8,2,db)).rejects.toMatchObject({status:403});});
it.each([null,NaN,-1,18])('keeps staff minor invitations separate from adult self-access (%s)',async age=>{authorizeStaff();ageOn.mockReturnValue(age);await expect(staffDependentInvitationAccess(staff,8,2,staffAccessDb())).rejects.toMatchObject({status:409});});
it('does not accept a mismatched audit actor for staff invitation',async()=>{await expect(inviteDependent({userId:99,staffUser:staff,clientId:8,agencyId:2,email:'teen@example.com',confirmed:true})).rejects.toMatchObject({status:403});expect(pool.getConnection).not.toHaveBeenCalled();});

it('creates and sends a restricted staff invitation with the staff audit identity while leaving guardian access unchanged',async()=>{
 authorizeStaff();ageOn.mockReturnValue(16);
 const execute=vi.fn(async sql=>{
  if(sql.includes('FROM user_agencies'))return [[{user_id:30}]];
  if(sql.includes('SELECT * FROM clients'))return [[{id:8,agency_id:2,date_of_birth:'2010-04-10',full_name:'Fictional Teen'}]];
  if(sql.startsWith('SELECT d.'))return [[{user_id:12,email:'teen@example.com',first_name:'Fictional'}]];
  if(sql.startsWith('INSERT INTO users'))return [{insertId:12}];
  if(sql.startsWith('UPDATE dependent_portal_access SET last_invited_at'))return [{affectedRows:1}];
  return [[]];
 });
 const db={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);pool.execute.mockImplementation(execute);
 User.findById.mockResolvedValue({id:12,password_hash:null});User.generatePasswordlessToken.mockResolvedValue({token:'fictional-test-only-token'});
 clientEmailContext.mockResolvedValue({portal:{slug:'test-practice'},tenant:{name:'Test practice'},url:path=>'https://example.invalid/'+path});sendClientPortalEmail.mockResolvedValue({id:41});
 await expect(inviteDependent({userId:30,staffUser:staff,agencyId:2,clientId:8,email:'teen@example.com',confirmed:true})).resolves.toEqual({sent:true});
 const link=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_guardians'));
 expect(JSON.parse(link[1][2])).toMatchObject({dependentSelfAccess:true,canSignDocs:false,canManageBilling:false});expect(link[1][3]).toBe(30);
 const audit=db.execute.mock.calls.find(([sql,args])=>sql.startsWith('INSERT INTO dependent_portal_events')&&args[3]==='invited');
 expect(audit[1][2]).toBe(30);expect(JSON.parse(audit[1][4])).toMatchObject({authority:'staff',agencyId:2});
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('UPDATE client_guardians'))).toBe(false);
 expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({userId:12,generatedByUserId:30,to:'teen@example.com'}));
});
