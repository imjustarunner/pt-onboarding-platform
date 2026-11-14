import{expect,it}from'vitest';import{canLoadClinicalSupervision}from'../nluWorkspace.js';
it.each(['provider','staff','admin'])('does not make clinical-supervision requests for %s in an explicitly learning-only organization',role=>{
 expect(canLoadClinicalSupervision({id:9,role},{id:453,feature_flags:{clinicalChartEnabled:false,standardsLearningEnabled:true}})).toBe(false);
});
it('preserves clinical supervision in a clinical organization',()=>{
 expect(canLoadClinicalSupervision({id:9,role:'provider'},{id:450,feature_flags:{clinicalChartEnabled:true}})).toBe(true);
});
it.each([null,undefined,{}])('waits for an organization before loading clinical history: %s',agency=>{
 expect(canLoadClinicalSupervision({id:9,role:'provider'},agency)).toBe(false);
});
