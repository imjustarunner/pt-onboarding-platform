import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {nluCredentialReadiness,assertNluCredentialConfirmation,tracksPrelicensureHours,combinedNluHandbookReview,NLU_COMBINED_UPDATE_MARKER} from '../nluProviderUpdatePolicy.js';
import {nluNovemberMigration} from '../../scripts/buildNluNovemberProviderUpdateMigration.js';
import {nluAmendmentServiceScope,renderNluAmendment,nluAmendmentIssues} from '../../content/nluCompensationAmendment.js';
import {requireNluProviderUpdateReadiness} from '../nluProviderUpdateReadiness.service.js';
it('does not confuse assigned supervision with prelicensure tracking',()=>{
 for(const value of [undefined,null,false,0,'0'])expect(tracksPrelicensureHours({supervisionIsPrelicensed:value,supervisors:[1]})).toBe(false);
 expect(tracksPrelicensureHours({supervisionIsPrelicensed:1})).toBe(true);
});
it('returns credential readiness only, with permanent passwords and an accessible recovery-address format',async()=>{
 const db={execute:vi.fn(async()=>[[{password_ready:1,personal_email:'person@example.test',password_hash:'never-return'}]])};
 expect(await nluCredentialReadiness(7,db)).toEqual({passwordReady:true,recoveryEmailReady:true});
 expect(db.execute.mock.calls[0][0]).toContain('temporary_password_hash IS NULL');
 db.execute.mockResolvedValueOnce([[{password_ready:0,personal_email:'invalid'}]]);
 expect(await nluCredentialReadiness(7,db)).toEqual({passwordReady:false,recoveryEmailReady:false});
});
it('requires server readiness and explicit safe-storage/recovery confirmations',()=>{
 const data={passwordStoredSafely:true,recoveryEmailConfirmed:true};
 expect(()=>assertNluCredentialConfirmation({passwordReady:false,recoveryEmailReady:true},data)).toThrow('permanent app password');
 expect(()=>assertNluCredentialConfirmation({passwordReady:true,recoveryEmailReady:false},data)).toThrow('Contact & Address');
 expect(()=>assertNluCredentialConfirmation({passwordReady:true,recoveryEmailReady:true},{})).toThrow('saved safely');
 expect(()=>assertNluCredentialConfirmation({passwordReady:true,recoveryEmailReady:true},data)).not.toThrow();
});
it('combines the full latest source and saved agency-specific changes only for the marked NLU edition',()=>{
 const source={reviewUpdates:[{id:'source-pay',subject:'Updated pay',handbook_section_slug:'pay',changed_content:'new pay'},{id:'source-tutor',subject:'Tutoring',handbook_section_slug:'tutoring',changed_content:'subjects and grades'}]};
 const original={digest:{id:4,title:'October',notes:NLU_COMBINED_UPDATE_MARKER,status:'draft'},entries:[{id:1,subject:'Old pay',handbook_section_slug:'pay',changed_content:'old pay'},{id:2,subject:'Local policy',changed_content:'keep this'}]};
 const result=combinedNluHandbookReview(original,source);
 expect(result.digest.period_label).toBe('October and November 2026');
 expect(result.entries).toHaveLength(3);expect(result.entries[0]).toMatchObject({id:1,changed_content:'new pay'});expect(result.entries[1].changed_content).toBe('keep this');
 expect(original.entries[0].changed_content).toBe('old pay');
 const other={...original,digest:{...original.digest,notes:'another-month'}};expect(combinedNluHandbookReview(other,source)).toBe(other);
});
it('shows both approved bachelor Direct Care and tutoring pay without implying psychotherapy duties',()=>{
 const data={employee:{name:'Synthetic staff',originalAgreementDate:'2026-10-01'},effectiveDate:'2026-11-21',schedule:{category:2,level:2,clinicalEligible:false,serviceRoles:['bachelors_counseling','tutoring'],hcodeRate:28,hcodeRateProbation:28,indirectRate:18,supportRate:18,tutoringLevel:2}};
 expect(nluAmendmentServiceScope(data)).toEqual({clinical:false,directCare:true});
 const html=renderNluAmendment(data);expect(html).toContain('<th>General Direct Care</th>');expect(html).toContain('Tutoring placement');expect(html).not.toContain('<th>Clinical Session Rate</th>');
 expect(nluAmendmentIssues(data)).not.toContain('Confirm creditRate for the individual schedule.');
 expect(nluAmendmentIssues(data).some(s=>s.includes('nonclinical-only'))).toBe(false);
});
it('omits Spanish intake and current client-follow-up material from both saved and source review changes',()=>{
 const entry={subject:'Spanish-language intake and handoff',handbook_section_slug:'spanish-language-intake-and-handoff',changed_content:'old handoff'};
 const result=combinedNluHandbookReview({digest:{notes:NLU_COMBINED_UPDATE_MARKER},entries:[entry,{subject:'Client updates',changed_content:'old follow-up'}]},{reviewUpdates:[entry,{subject:'Current pay',changed_content:'keep'}]});
 expect(result.entries.map(e=>e.subject)).toEqual(['Current pay']);
});
it('generates a recoverable, repeatable draft-only content migration without changing credentials, signatures or pay',()=>{
 const sql=nluNovemberMigration();
 expect(sql).toContain('snapshot_json');expect(sql).toContain('automation_actor');expect(sql).toContain("p.status<>'draft'");expect(sql).toContain("LEFT(r.token,8)<>'preview_'");expect(sql).toContain('revision.applied_at IS NULL');
 expect(sql).toContain('October and November 2026');expect(sql).toContain('"amendments":true');expect(sql).toContain('"school_availability":false');expect(sql).toContain('data-training-key');
 expect(sql).not.toMatch(/UPDATE (?:users|signed_documents|payroll|provider_tutoring_profiles)/i);
});
it('fails startup for an incomplete migration and reports held issued updates without modifying them',async()=>{
 const db={execute:vi.fn().mockResolvedValueOnce([[{success:0}]])};
 await expect(requireNluProviderUpdateReadiness(db)).rejects.toThrow('not verified');
 db.execute.mockResolvedValueOnce([[{success:1}]]).mockResolvedValueOnce([[{applied_at:null}]]);
 await expect(requireNluProviderUpdateReadiness(db)).rejects.toThrow('incomplete');
 db.execute.mockResolvedValueOnce([[{success:1}]]).mockResolvedValueOnce([[]]);
 await expect(requireNluProviderUpdateReadiness(db)).resolves.toMatchObject({appliedDrafts:0,heldForIssuedUpdate:true});
 db.execute.mockResolvedValueOnce([[{success:1}]]).mockResolvedValueOnce([[{applied_at:'2026-11-16'}]]);
 await expect(requireNluProviderUpdateReadiness(db)).resolves.toMatchObject({appliedDrafts:1,heldForIssuedUpdate:false});
 expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
