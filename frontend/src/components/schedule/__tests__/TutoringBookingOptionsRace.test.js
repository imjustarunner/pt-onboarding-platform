import vm from 'node:vm';
import {parse} from '@babel/parser';
import {it,expect,vi} from 'vitest';
import file from '../ScheduleAvailabilityGrid.vue?raw';
const script=file.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1];
const node=parse(script,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadEditorTenantServices');
const source=script.slice(node.start,node.end);
const response=(ids=[],subjects=[])=>({data:{services:[{id:320,businessType:'tutoring',name:'Tutoring'}],packagePreview:{entitlements:ids.map(id=>({id,sessionsRemaining:2}))},tutoringSubjects:subjects,canSetTutoringSessionPrice:false}});
function harness(){const pending=[],get=vi.fn(()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))),ctx={api:{get},props:{userId:1496},editorServicesRequest:0,editorOptionsIdentity:'',practiceCategoryForBusinessType:type=>type};
 for(const [,name]of source.matchAll(/\b(\w+)\.value/g))ctx[name]??={value:null};
 const values={editorAgencyId:453,effectiveAgencyId:453,editorIsClinical:true,editorServicesLoading:false,bookingTargetUserId:1496,virtualSessionSelectedClientIds:[],editorHydratingAppointment:false,isAppointmentEditMode:false,isScheduleEventEditMode:false,editorPackageEntitlements:[],editorPackageEntitlementId:0,editorTutoringSubjects:[],editorTutoringSubject:'assigned',editorCanSetTutoringPrice:false,tutoringWorkspaceOnly:true,editorTenantServices:[],editorTenantServiceId:320,editorPracticeCategory:'tutoring',mixedSessionServices:false};
 for(const [name,value]of Object.entries(values))ctx[name]={value};
 return {ctx,pending,get,load:vm.runInNewContext(source+';loadEditorTenantServices',ctx)};
}
it('keeps the selected student packages/Math choice when an older no-student response arrives last',async()=>{const h=harness(),old=h.load();h.ctx.virtualSessionSelectedClientIds.value=[2545];const current=h.load();h.pending[1].resolve(response([2],[{key:'service:1038',label:'Math'}]));await current;h.pending[0].resolve(response());await old;expect(h.ctx.editorPackageEntitlements.value.map(e=>e.id)).toEqual([2]);expect(h.ctx.editorTutoringSubject.value).toBe('service:1038');expect(h.ctx.editorCanSetTutoringPrice.value).toBe(false);});
it('does not clear the new student choices when an old request fails',async()=>{const h=harness(),old=h.load();h.ctx.virtualSessionSelectedClientIds.value=[2545];const current=h.load();h.pending[1].resolve(response([2]));await current;h.pending[0].reject(new Error('older request failed'));await old;expect(h.ctx.editorPackageEntitlements.value.map(e=>e.id)).toEqual([2]);});
it('clears a prior student package selection immediately and keeps loading until the current response finishes',async()=>{const h=harness(),old=h.load();h.ctx.editorPackageEntitlementId.value=2;h.ctx.virtualSessionSelectedClientIds.value=[2547];const current=h.load();expect(h.ctx.editorPackageEntitlementId.value).toBe(0);expect(h.ctx.editorPackageEntitlements.value).toEqual([]);h.pending[0].resolve(response([2]));await old;expect(h.ctx.editorServicesLoading.value).toBe(true);h.pending[1].resolve(response());await current;expect(h.ctx.editorServicesLoading.value).toBe(false);expect(h.ctx.editorPackageEntitlements.value).toEqual([]);});
