import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import SchoolPaperPacketWorkflow from '../SchoolPaperPacketWorkflow.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('../../documents/PDFPreview.vue',()=>({default:{props:['pdfUrl'],template:'<div data-test="packet">{{pdfUrl}}</div>'}}));
const saveInsurance=vi.fn(),saveRoi=vi.fn();
let context,w;
const steps=['demographics','guardian1','guardian2','school','insurance'];
const guardian=(id)=>({guardian_user_id:id,first_name:'Synthetic',last_name:`Parent ${id}`,email:`parent${id}@example.com`,relationship_title:'Parent',access_enabled:1});
beforeEach(()=>{
 vi.clearAllMocks();saveInsurance.mockResolvedValue(true);saveRoi.mockResolvedValue(true);
 context={client:{id:4,agency_id:2,organization_id:3,full_name:'Synthetic Student',date_of_birth:'2018-01-02',insurance_type_id:7},schoolName:'Example School',guardians:[guardian(20),guardian(21)],state:{completedSteps:[],invitations:{}},packetRead:{documentId:9,status:'applied',roiSignatureDetected:true,disclosureSignatureDetected:true,versionLabel:'2026-08-20'}};
 api.get.mockImplementation(async(path)=>({data:path.endsWith('/paper-packet-processing')?structuredClone(context):path==='/phi-documents/clients/4'?[{id:9,client_id:4,mime_type:'application/pdf',scan_status:'clean'}]:path.includes('/view')?{url:'/synthetic-private-packet.pdf'}:path==='/client-settings/insurance-types'?[{id:7,label:'Commercial',is_active:1}]:[]}));
 api.put.mockImplementation(async(path,{step,data})=>{context.state.completedSteps=[...new Set([...context.state.completedSteps,step])];if(step==='demographics')context.state.documentId=data.documentId;if(step.startsWith('guardian'))context.state[`${step}Id`]=data.guardianUserId||null;return {data:{state:structuredClone(context.state)}};});
 api.post.mockResolvedValue({data:{state:{completedSteps:steps,processedAt:'2026-11-07T22:00:00Z',invitations:{20:{status:'sent'},21:{status:'failed'}}}}});
});
afterEach(()=>w?.unmount());
async function render(){w=mount(SchoolPaperPacketWorkflow,{props:{clientId:4},global:{stubs:{
 PDFPreview:{props:['pdfUrl'],template:'<div data-test="packet">{{pdfUrl}}</div>'},
 ClientInsuranceEditor:{template:'<form><input value="Unsaved policy edit" /></form>',methods:{save:saveInsurance}},
 AssignmentCoverageReview:true,ClientOnboardingRoiStaffPanel:{template:'<div data-test="roi"/>',methods:{saveAllDirty:saveRoi}}
}}});await flushPromises();}
const next=()=>w.findAll('.paper-actions button').at(-1).trigger('click');
it('keeps the PDF visible beside one step and resumes saved progress with separate guardian accounts',async()=>{
 await render();expect(w.get('[data-test="packet"]').text()).toContain('synthetic-private-packet.pdf');expect(w.findAll('fieldset')).toHaveLength(1);
 await next();await flushPromises();expect(w.get('h4').text()).toContain('Parent 1');await next();await flushPromises();expect(context.state.guardian1Id).toBe(20);
 w.unmount();await render();expect(w.get('h4').text()).toContain('Parent 2');await next();await flushPromises();expect(context.state.guardian2Id).toBe(21);expect(api.post).not.toHaveBeenCalled();expect(w.get('[data-test="packet"]').exists()).toBe(true);
});
it('saves insurance corrections before advancing, and stays on the step when that save fails',async()=>{
 context.state={completedSteps:steps.slice(0,4),documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes'};await render();
 await w.get('input[type="checkbox"]').setValue(true);saveInsurance.mockResolvedValueOnce(false);await next();await flushPromises();expect(w.get('h4').text()).toContain('Insurance');expect(api.put).not.toHaveBeenCalled();
 await next();await flushPromises();expect(saveInsurance).toHaveBeenCalledTimes(2);expect(api.put).toHaveBeenCalledWith(expect.anything(),{step:'insurance',data:{reviewed:true,insuranceTypeId:7}});expect(w.get('h4').text()).toContain('Review');expect(w.findAll('form form')).toHaveLength(0);
});
it('finishes only after saving ROI corrections and displays each recipient outcome',async()=>{
 context.state={completedSteps:steps,documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes'};await render();
 for(const field of w.findAll('input[type="checkbox"]'))await field.setValue(true);
 saveRoi.mockResolvedValueOnce(false);await next();await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.get('[role="alert"]').text()).toContain('ROI corrections');
 await next();await flushPromises();expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/4/paper-packet-processing/complete',{signaturesConfirmed:true,staffRoiConfirmed:true});expect(w.text()).toContain('Parent 20: sent');expect(w.text()).toContain('Parent 21: failed');
 await w.findAll('button').find(b=>b.text()==='Retry failed invitations').trigger('click');await flushPromises();expect(saveRoi).toHaveBeenCalledTimes(2);expect(api.post).toHaveBeenCalledTimes(2);
});
it('keeps an unmatched paper packet pending without offering a new signature form',async()=>{
 context.state={completedSteps:steps,documentId:9};context.packetRead.status='needs_review';await render();expect(w.findAll('.paper-actions button').at(-1).attributes('disabled')).toBeDefined();expect(w.text()).toContain('no new signatures');expect(w.find('canvas').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});
