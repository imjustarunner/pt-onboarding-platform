import{expect,it}from'vitest';import{canLoadClinicalSupervision,serviceWorkspace}from'../nluWorkspace.js';
it.each([null,undefined])('handles an organization that has not loaded: %s',agency=>{
 expect(serviceWorkspace({role:'provider'},agency)).toMatchObject({agencyId:null,canClinical:false,canTutor:false,canChildcare:false});
});
it.each(['provider','staff','admin'])('does not make clinical-supervision requests for %s in an explicitly learning-only organization',role=>{
 expect(canLoadClinicalSupervision({id:9,role},{id:453,feature_flags:{clinicalChartEnabled:false,standardsLearningEnabled:true}})).toBe(false);
});
it('preserves clinical supervision in a clinical organization',()=>{
 expect(canLoadClinicalSupervision({id:9,role:'provider'},{id:450,feature_flags:{clinicalChartEnabled:true}})).toBe(true);
});
it.each([null,undefined,{}])('waits for an organization before loading clinical history: %s',agency=>{
 expect(canLoadClinicalSupervision({id:9,role:'provider'},agency)).toBe(false);
});
it('honors an authorized mixed-service context without changing the retained QA identity',()=>{
 const agency={id:453,feature_flags:{qaSandbox:{program:'tutoring'},clinicalChartEnabled:true,standardsLearningEnabled:true}};
 const user={id:1433,role:'provider',workspaceServiceContext:{agencyId:453,canTutor:true,canClinical:true,canChildcare:true,learningOnly:false}};
 expect(serviceWorkspace(user,agency)).toMatchObject({canTutor:true,canClinical:true,canChildcare:true,learningOnly:false});
 expect(canLoadClinicalSupervision(user,agency)).toBe(true);
 expect(serviceWorkspace({...user,workspaceServiceContext:{...user.workspaceServiceContext,canClinical:false,learningOnly:true}},agency).learningOnly).toBe(true);
 expect(serviceWorkspace({...user,workspaceServiceContext:{...user.workspaceServiceContext,agencyId:6}},agency)).toMatchObject({canClinical:false,learningOnly:true});
});
