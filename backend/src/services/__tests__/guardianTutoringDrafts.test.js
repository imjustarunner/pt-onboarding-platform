import{expect,it,vi}from'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../intakeResponsesEncryption.service.js',()=>({decryptIntakeSubmissionRow:row=>row}));
import{enrollmentDraftTasks,enrollmentDraftSummary,listGuardianEnrollmentDrafts}from'../guardianEnrollmentDrafts.service.js';
it('does not invent insurance to-dos for a saved tutoring request',()=>{
 expect(enrollmentDraftTasks({}, {channel:'tutoring'})).toEqual(['Complete communication choices','Review the current agreements and submit your enrollment']);
 expect(enrollmentDraftTasks({})).toContain('Sign the insurance authorization');
});
it('preserves but does not reopen misrouted clinical drafts in a learning-only organization',async()=>{
 const flags={clinicalChartEnabled:false,standardsLearningEnabled:true};
 const row={guardian_user_id:1759,intake_data:{portalEnrollment:{userId:1759,agencyId:453,email:'qa.nlu.parent@example.com'}},enrollment_feature_flags:flags};
 const execute=vi.fn().mockResolvedValueOnce([[{user_id:1759}]]).mockResolvedValueOnce([[{...row,id:1,master_channel:'office'},{...row,id:2,master_channel:'tutoring'}]]);
 const result=await listGuardianEnrollmentDrafts({userId:1759,agencyId:453},{db:{execute},users:{findById:async()=>({id:1759,role:'client_guardian',email:'qa.nlu.parent@example.com'})}});
 expect(result.map(entry=>entry.row.id)).toEqual([2]);expect(execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});

it('distinguishes an empty opened enrollment from saved answers without deleting the draft',()=>{
 const row={id:10,master_channel:'tutoring',draft_expires_at:'2026-12-01'};
 expect(enrollmentDraftSummary({row,data:{clients:[],progressStep:1}})).toMatchObject({id:10,channel:'tutoring',hasAnswers:false});
 expect(enrollmentDraftSummary({row,data:{clients:[{firstName:'Synthetic learner'}],progressStep:1}}).hasAnswers).toBe(true);
 expect(enrollmentDraftSummary({row,data:{clients:[],progressStep:2}}).hasAnswers).toBe(true);
});
