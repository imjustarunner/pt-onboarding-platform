import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import { isReviewedStarterPlan } from '../starterTreatmentPlanReview.service.js';
import { readableIntakeKey, readableIntakeValue, flattenIntakeFields } from '../../utils/intakeResponsePresentation.js';
import Access, {getEffectiveSchoolStaffRoiState,schoolStaffCanOpenClient,schoolStaffCanViewClientDocuments} from '../../models/ClientSchoolStaffRoiAccess.model.js';
it('requires explicit review and recorded client priorities before using a starter plan without finalized intake',()=>{
 const body={sourceToolId:'note_aid_starter_plan',starterPlanReviewed:true,clientIdentifiedGoals:'Sleep more consistently',goals:[{goalText:'Client-identified priorities: Sleep more consistently'}]};
 expect(isReviewedStarterPlan(body)).toBe(true);
 for(const change of [{starterPlanReviewed:false},{clientIdentifiedGoals:''},{goals:[]},{sourceToolId:'note_aid_plan_standalone'}])expect(isReviewedStarterPlan({...body,...change})).toBe(false);
});
it('shows readable values without losing false, zero or free text',()=>{
 expect(readableIntakeKey('LIFE_SLEEP')).toBe('Life sleep');expect(readableIntakeKey('CLINICALSAFETYALERT')).toBe('Clinical safety alert');
 expect(readableIntakeValue(false)).toBe('No');expect(readableIntakeValue(0)).toBe('0');expect(readableIntakeValue('going_well')).toBe('Going well');
 expect(readableIntakeValue('Original free text')).toBe('Original free text');
 const [field]=flattenIntakeFields([],[{fields:[{key:'sleep',label:'How is your sleep?',options:[{value:'going_well',label:'Sleeping well'}]}]}]);
 expect(readableIntakeValue('going_well',field)).toBe('Sleeping well');
});
it('denial blocks overview, documents and all permissive authorization flags',async()=>{
 const row={access_level:'roi_docs',is_active:1,guardian_consent:{effectiveDecision:'none'}};
 expect(getEffectiveSchoolStaffRoiState(row,'2099-01-01',{schoolStaffInOrg:true})).toBe('denied');
 expect(schoolStaffCanOpenClient(row,'2099-01-01',{schoolStaffInOrg:true})).toBe(false);
 expect(schoolStaffCanViewClientDocuments(row,'2099-01-01')).toBe(false);
 const mock=vi.spyOn(Access,'resolveSchoolStaffClientAccessState').mockResolvedValue('denied');
 try {expect(await Access.schoolStaffHasActiveRoiAccess({clientId:1,schoolOrganizationId:2,schoolStaffUserId:3,includeLimited:true,allowExpiredOverview:true,allowNoRoiInterface:true})).toBe(false);} finally{mock.mockRestore();}
});
