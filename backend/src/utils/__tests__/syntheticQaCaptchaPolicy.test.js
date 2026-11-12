import { describe, it, expect } from 'vitest';
import { isSyntheticQaCaptchaAgency, canSkipSyntheticQaRecoveryCaptcha, isSyntheticQaPublicCaptchaContext } from '../syntheticQaCaptchaPolicy.js';
const qa = { id:450,slug:'auricwell-qa-demo',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true}} };
const school={...qa,id:451,slug:'auricwell-qa-demo-school',affiliated_agency_id:450};
const clinic={...qa,id:452,slug:'auricwell-qa-demo-clinic',affiliated_agency_id:450};
const nlu={...qa,id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
const learning={...nlu,id:454,slug:'nlu-qa-learning',affiliated_agency_id:453};
const scb={...qa,id:456,slug:'scb-qa-company',organization_type:'agency',feature_flags:{qaCaptcha:{syntheticOnly:true}}};
const user={id:1496,is_demo:1,is_active:1,is_archived:0};
describe('retained synthetic tenant CAPTCHA boundary',()=>{
 it.each([qa,school,clinic,nlu,learning,scb])('allows only the exact active stored demo %s',agency=>{
  expect(isSyntheticQaCaptchaAgency(agency)).toBe(true);
  expect(isSyntheticQaCaptchaAgency({...agency,feature_flags:JSON.stringify(agency.feature_flags)})).toBe(true);
 });
 it.each([null,{}, {...qa,id:2}, {...nlu,id:6}, {...qa,slug:'itsco'}, {...qa,is_active:0}, {...qa,is_archived:1}, {...qa,feature_flags:'{broken'}, {...qa,feature_flags:{qaSandbox:{syntheticOnly:'true'}}}, {...learning,affiliated_agency_id:6}, {...school,affiliated_agency_id:2}, {...clinic,slug:'real-clinic'}, {...scb,feature_flags:{}}, {...scb,organization_type:'school'}, {...scb,feature_flags:{qaCaptcha:{syntheticOnly:'true'}}}])('rejects ordinary/spoofed/misbound stored records %s',agency=>expect(isSyntheticQaCaptchaAgency(agency)).toBe(false));
 it.each([[user,[nlu,learning],'nlu-qa-demo'],[user,[qa,scb],'auricwell-qa-demo'],[user,[qa,school],'auricwell-qa-demo-school'],[user,[qa],'auricwell-qa-demo']])('permits account-bound recovery only for synthetic memberships', (u,agencies,slug)=>expect(canSkipSyntheticQaRecoveryCaptcha(u,agencies,slug)).toBe(true));
 it.each([[{...user,is_demo:0},[qa],'auricwell-qa-demo'],[user,[qa,{id:2,slug:'itsco',is_active:1}],'auricwell-qa-demo'],[user,[qa],'itsco'],[user,[qa],'nlu-qa-demo'],[user,[],'auricwell-qa-demo'],[{...user,is_active:0},[qa],'auricwell-qa-demo'],[{...user,switchedFromUserId:1},[qa],'auricwell-qa-demo']])('does not exempt real/mixed/wrong-tenant accounts',(u,agencies,slug)=>expect(canSkipSyntheticQaRecoveryCaptcha(u,agencies,slug)).toBe(false));
});

it('public exemption requires an explicit stored demo route, never a marketing brand alias',()=>{
 expect(isSyntheticQaPublicCaptchaContext(qa,qa.slug)).toBe(true);
 expect(isSyntheticQaPublicCaptchaContext(qa,'450')).toBe(true);
 for(const alias of ['plotline','fundthred','auricwell','itsco','nlu','schoolcarebridge',''])expect(isSyntheticQaPublicCaptchaContext(qa,alias)).toBe(false);
});
