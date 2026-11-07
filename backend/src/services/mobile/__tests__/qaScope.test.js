import {it,expect} from 'vitest';
import {mobileQaScope,assertMobileQaInputs,enforceMobileQaBoundary,qaClinicalRouteAllowed} from '../qaScope.service.js';
const user={id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE'};
const agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
it('reuses only the approved identity and exact clinical synthetic tenant, excluding other memberships',()=>{
 const result=mobileQaScope(user,[agency,{id:456,slug:'scb-qa-company'},{id:1,slug:'live',feature_flags:agency.feature_flags}]);
 expect(result.qaAgencyIds).toEqual([450]);expect(result.agencies).toEqual([agency]);
 expect(mobileQaScope(user,[{...agency,feature_flags:JSON.stringify(agency.feature_flags)}]).qaAgencyIds).toEqual([450]);
});
it('fails closed for demo lookalikes, altered roles and removed or malformed synthetic grants',()=>{
 for(const actor of [{...user,email:'other@example.com'},{...user,role:'super_admin'},{...user,is_demo:'unknown'},{...user,is_active:0},{...user,is_archived:1},{...user,status:'TERMINATED_PENDING'}])expect(()=>mobileQaScope(actor,[agency])).toThrow();
 for(const record of [{...agency,feature_flags:{}},{...agency,feature_flags:'invalid'},{...agency,id:456},{...agency,slug:'live'}])expect(()=>mobileQaScope(user,[record])).toThrow();
});
it('preserves ordinary staff membership behavior',()=>{const agencies=[agency,{id:456}];expect(mobileQaScope({...user,is_demo:0},agencies)).toEqual({agencies,qaAgencyIds:null});});
it('rejects nested foreign agency requests and mixed agency lists',()=>{
 for(const value of [{agencyId:456},{metadata:{agency_id:1}},{agencyIds:[450,456]},{agency_ids:'450,456'}])expect(()=>assertMobileQaInputs(value,[450])).toThrow();
 expect(()=>assertMobileQaInputs({agencyId:'all',metadata:{agency_id:450}},[450])).not.toThrow();
});
it('requires the primary device and matching approved workspace at the central boundary',async()=>{
 for(const quickView of [{qaAgencyIds:[450],agencyId:450},{qaAgencyIds:[450],agencyId:456,mobileDeviceSessionId:2}])await expect(enforceMobileQaBoundary({quickView,method:'GET',originalUrl:'/api/quick-view/my-work'})).rejects.toMatchObject({status:403});
 await expect(enforceMobileQaBoundary({quickView:{qaAgencyIds:[450],agencyId:450,mobileDeviceSessionId:2},method:'GET',originalUrl:'/api/quick-view/my-work'})).resolves.toBeUndefined();
});
it('allows the existing clinical adapters while refusing arbitrary new routes and outbound family delivery',async()=>{
 const req={quickView:{qaAgencyIds:[450],agencyId:450,mobileDeviceSessionId:2},method:'POST',body:{agencyId:450}};
 await expect(enforceMobileQaBoundary({...req,originalUrl:'/api/quick-view/clinical/generate'})).resolves.toBeUndefined();
 await expect(enforceMobileQaBoundary({...req,body:{...req.body,channel:'secure'},originalUrl:'/api/quick-view/clinical/clients/8/contact'})).resolves.toBeUndefined();
 for(const path of ['/future-admin-api','/office','/contacts','/clinical/clients/8/contact/send','/clinical/recording/session/3/consent/4/assign'])await expect(enforceMobileQaBoundary({...req,originalUrl:'/api/quick-view'+path})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
 await expect(enforceMobileQaBoundary({...req,quickView:{agencyId:1},originalUrl:'/api/quick-view/contacts'})).resolves.toBeUndefined();
});
it('denies alternate numeric and encoded path forms, trailing slash delivery attempts and future clinical routes',async()=>{
 const req={quickView:{qaAgencyIds:[450],agencyId:450,mobileDeviceSessionId:2},method:'POST',body:{agencyId:450,channel:'secure'}};
 for(const id of ['1','1e0','01','1.0','+1','0x1','%31','%2531','1%2f0'])for(const suffix of ['','/','//']){
  for(const path of [`/clinical/clients/${id}/contact/send${suffix}`,`/clinical/recording/session/1/consent/${id}/assign${suffix}`])
   await expect(enforceMobileQaBoundary({...req,originalUrl:'/api/quick-view'+path})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
 }
 for(const id of ['1e0','01','1.0','+1','0x1','%31'])await expect(enforceMobileQaBoundary({...req,originalUrl:`/api/quick-view/clinical/notes/${id}/sign`})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
 for(const path of ['/clinical/future-export','/clinical/generate/evil','/clinical/clients/1/contact%2fsend'])await expect(enforceMobileQaBoundary({...req,originalUrl:'/api/quick-view'+path})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
 await expect(enforceMobileQaBoundary({...req,originalUrl:'/api/quick-view/clinical/notes/1/sign/'})).resolves.toBeUndefined();
 await expect(enforceMobileQaBoundary({...req,method:'DELETE',originalUrl:'/api/quick-view/clinical/notes/1/sign'})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
});
it('requires canonical resolved IDs for direct messaging parameters too',async()=>{
 for(const id of ['01','1e0','0','9007199254740993'])await expect(enforceMobileQaBoundary({quickView:{qaAgencyIds:[450],agencyId:450,mobileDeviceSessionId:2},method:'GET',originalUrl:'/api/quick-view/conversations/'+id,params:{id}})).rejects.toMatchObject({code:'MOBILE_QA_SURFACE_UNAVAILABLE'});
});
it('allowlists each supported clinical workflow explicitly by HTTP method',()=>{
 for(const[method,path]of [['GET','/clinical/context'],['GET','/clinical/clients/1/summary'],['GET','/clinical/assessments/client_document/1/view'],['GET','/clinical/assessments/session_material/1/view'],['GET','/clinical/service-reference/PRO_BONO_SERVICE'],['GET','/clinical/narriva/reviews/1'],['GET','/clinical/narriva/notes/1/status'],['GET','/clinical/sessions/1/service'],['GET','/clinical/notes/1'],['GET','/clinical/recording/session/1/narrative'],['GET','/clinical/recording/session/1/consent/2/pdf'],['POST','/clinical/assessments/1/scan'],['POST','/clinical/sessions/1/notes'],['POST','/clinical/notes/1/cosign'],['POST','/clinical/objectives/1/ratings'],['POST','/clinical/recording/session/1/audio'],['POST','/clinical/recording/session/1/consent/2/sign'],['PATCH','/clinical/drafts/1'],['PATCH','/clinical/narriva/reviews/1/findings'],['PATCH','/clinical/narriva/preferences']])expect(qaClinicalRouteAllowed(method,path)).toBe(true);
 expect(qaClinicalRouteAllowed('GET','/clinical/future-records')).toBe(false);
});
