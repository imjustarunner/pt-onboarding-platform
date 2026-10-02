import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../intakeSummaryPdfEmail.service.js',()=>({emailSummaryPdfCopy:vi.fn()}));
vi.mock('../guardianNotificationEmail.service.js',()=>({sendGuardianNotificationEmail:vi.fn()}));
import pool from '../../config/database.js';
import { acceptCoGuardianInvite, assertActiveCoGuardianInvite, completedCoGuardianPermissions } from '../coGuardianInvite.service.js';
const invite=()=>({id:1,agency_id:2,public_key:'packet',status:'pending',expires_at:new Date(Date.now()+86400000)});
describe('co-parent invitation boundaries',()=>{
 it.each(['pending','accepted'])('expires %s tokens',status=>{expect(()=>assertActiveCoGuardianInvite({...invite(),status,expires_at:new Date(0)})).toThrow('expired');});
 it.each(['revoked','completed','invalid'])('rejects inactive %s invitations',status=>{expect(()=>assertActiveCoGuardianInvite({...invite(),status})).toThrow('no longer active');});
 it('rejects a different tenant or packet',()=>{expect(()=>assertActiveCoGuardianInvite(invite(),{agencyId:3})).toThrow('different');expect(()=>assertActiveCoGuardianInvite(invite(),{publicKey:'other'})).toThrow('different');});
 it('accepts only the active bound packet',()=>{expect(assertActiveCoGuardianInvite(invite(),{agencyId:2,publicKey:'packet'}).id).toBe(1);});
 it('releases invitation-only restrictions after completion without sharing intake answers',()=>{expect(completedCoGuardianPermissions(1,{coGuardianInviteId:1,coGuardianInviteRestricted:true,noView:true,noViewOtherGuardian:true})).toMatchObject({noView:false,noViewOtherGuardian:false,hideOtherGuardianAnswers:true,canMessage:true});});
 it('preserves a deliberate restriction on an existing relationship',()=>{expect(completedCoGuardianPermissions(1,{noView:true,canMessage:false})).toMatchObject({noView:true,canMessage:false});});
 it('does not release restrictions from a different invitation',()=>{expect(completedCoGuardianPermissions(1,{coGuardianInviteId:2,coGuardianInviteRestricted:true,noView:true})).toMatchObject({noView:true});});
});

it('cannot activate an office guardian by bypassing the enrollment packet',async()=>{pool.execute.mockResolvedValueOnce([[{...invite(),source:'office'}]]);await expect(acceptCoGuardianInvite({token:'synthetic'})).rejects.toMatchObject({status:409});});
