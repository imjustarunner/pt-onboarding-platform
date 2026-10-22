import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import ClientInsuranceEditor from '../ClientInsuranceEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1,role:'staff'}})}));
vi.mock('../../../config/medicalBillingAccess.js',()=>({canAccessMedicalBilling:vi.fn(()=>true)}));
import { canAccessMedicalBilling } from '../../../config/medicalBillingAccess.js';
const demographic={firstName:'Test',lastName:'Patient',dateOfBirth:'1996-10-01',addressLine1:'123 Synthetic St',city:'Test City',state:'CO',postalCode:'80000',sex:'F'};
beforeEach(()=>{vi.clearAllMocks();canAccessMedicalBilling.mockReturnValue(true);api.get.mockResolvedValue({data:{insurance:null,demographics:demographic,missingClaimFields:['Member ID is missing']}});api.put.mockResolvedValue({data:{missingClaimFields:['Member ID is missing']}});});
async function setup(){const w=mount(ClientInsuranceEditor,{props:{clientId:5,agencyId:377},global:{stubs:{ClientCoverageVerification:true,ClientDocumentationReadiness:true}}});await w.find('button').trigger('click');await flushPromises();return w;}
it('prefills empty chart identity without replacing saved insurance-specific identity',async()=>{
 api.get.mockResolvedValue({data:{insurance:{patient:{firstName:'Policy name'},primary:{}},demographics:demographic}});const w=await setup();const fields=w.findAll('.identity-fields input');expect(fields[0].element.value).toBe('Policy name');expect(fields[2].element.value).toBe('1996-10-01');expect(fields[4].element.value).toBe('123 Synthetic St');w.unmount();
});
it('allows incomplete drafts to save and confirms persisted but incomplete status',async()=>{
 const w=await setup();expect(w.find('form').attributes()).toHaveProperty('novalidate');expect(w.findAll('input[required]')).toHaveLength(0);await w.find('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/medical-billing/clients/5/insurance',expect.objectContaining({agencyId:377,patient:expect.objectContaining({dateOfBirth:'1996-10-01'}),verifiedForClaims:false}));expect(w.find('[role="status"]').text()).toContain('Insurance saved');expect(w.find('[role="status"]').text()).toContain('before submission');w.unmount();
});
it('uses patient identity for self subscribers and tracks later identity corrections',async()=>{
 const w=await setup();await w.find('.policy-fields select').setValue('self');await flushPromises();expect(w.text()).toContain('no duplicate entry');expect(w.text()).not.toContain('Subscriber legal first name');await w.findAll('.identity-fields input')[0].setValue('Corrected');await w.find('form').trigger('submit');await flushPromises();expect(api.put.mock.calls[0][1].primary).toMatchObject({relationshipToSubscriber:'self',subscriberFirstName:'Corrected',subscriberDob:'1996-10-01',subscriberAddressLine1:'123 Synthetic St'});w.unmount();
});
it('does not report a failed save as successful',async()=>{api.put.mockRejectedValue({response:{data:{error:{message:'Permission changed'}}}});const w=await setup();await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role="alert"]').text()).toBe('Permission changed');expect(w.find('[role="status"]').exists()).toBe(false);w.unmount();});
it('discards late reads after switching client',async()=>{let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const w=mount(ClientInsuranceEditor,{props:{clientId:5,agencyId:377}});await w.find('button').trigger('click');await w.setProps({clientId:6});resolve({data:{demographics:demographic}});await flushPromises();expect(w.find('form').exists()).toBe(false);w.unmount();});
it('combines parents’ policies independently, preserves source references, and swaps billing order',async()=>{
 const first={insurerName:'Parent One Coverage',memberId:'FIRST'},second={insurerName:'Parent Two Coverage',memberId:'SECOND'};
 api.get.mockResolvedValue({data:{insurance:{primary:first},demographics:demographic,policies:[{id:11,submittedBy:'First parent',primary:first,cardEvidence:{primary_front:true}},{id:22,submittedBy:'Second parent',primary:second,cardEvidence:{primary_front:true,primary_back:true}}]}});
 const w=await setup();const choices=w.findAll('.coverage-review select');await choices[0].setValue('11:primary');await choices[1].setValue('22:primary');
 await w.find('form').trigger('submit');await flushPromises();expect(api.put.mock.calls[0][1]).toMatchObject({primary:first,secondary:second,coverageSources:{primary:{profileId:11,slot:'primary'},secondary:{profileId:22,slot:'primary'}},verifiedForClaims:false});
 await w.findAll('button').find(b=>b.text()==='Swap primary and secondary').trigger('click');await w.find('form').trigger('submit');await flushPromises();expect(api.put.mock.calls[1][1]).toMatchObject({primary:second,secondary:first,profileId:22,coverageSources:{primary:{profileId:22,slot:'primary'},secondary:{profileId:11,slot:'primary'}}});
 expect(w.findAll('.coverage-evidence')).toHaveLength(2);expect(w.findAll('.coverage-evidence button')).toHaveLength(3);w.unmount();
});

it('allows support insurance entry without mounting claim verification or billing readiness',async()=>{
 canAccessMedicalBilling.mockReturnValue(false);
 const w=mount(ClientInsuranceEditor,{props:{clientId:5,agencyId:377,accountSupport:true},global:{stubs:{ClientCoverageVerification:true,ClientDocumentationReadiness:true}}});
 await w.find('button').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/clients/5/account-support/insurance',{params:{agencyId:377}});
 expect(w.find('client-coverage-verification-stub').exists()).toBe(false);
 expect(w.find('client-documentation-readiness-stub').exists()).toBe(false);
 expect(w.text()).not.toContain('verified coverage for claim preparation');
 expect(w.text()).not.toContain('Provider accepts assignment');
 await w.find('form').trigger('submit');await flushPromises();
 const [path,payload]=api.put.mock.calls[0];expect(path).toBe('/clients/5/account-support/insurance');
 expect(payload).not.toHaveProperty('verifiedForClaims');expect(payload).not.toHaveProperty('acceptAssignment');
 expect(w.find('[role="status"]').text()).toBe('Insurance information saved for billing review.');w.unmount();
});
it('hides insurance without billing or support access and discards data when support access is revoked',async()=>{
 canAccessMedicalBilling.mockReturnValue(false);
 const w=mount(ClientInsuranceEditor,{props:{clientId:5,agencyId:377}});expect(w.find('button').exists()).toBe(false);expect(api.get).not.toHaveBeenCalled();
 await w.setProps({accountSupport:true});await w.find('button').trigger('click');await flushPromises();expect(w.find('form').exists()).toBe(true);
 await w.setProps({accountSupport:false});expect(w.find('form').exists()).toBe(false);w.unmount();
});
