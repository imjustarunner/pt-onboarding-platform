import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import ClientInsuranceEditor from '../ClientInsuranceEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1,role:'staff'}})}));
vi.mock('../../../config/medicalBillingAccess.js',()=>({canAccessMedicalBilling:()=>true}));
const demographic={firstName:'Test',lastName:'Patient',dateOfBirth:'1996-10-01',addressLine1:'123 Synthetic St',city:'Test City',state:'CO',postalCode:'80000',sex:'F'};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{insurance:null,demographics:demographic,missingClaimFields:['Member ID is missing']}});api.put.mockResolvedValue({data:{missingClaimFields:['Member ID is missing']}});});
async function setup(){const w=mount(ClientInsuranceEditor,{props:{clientId:5,agencyId:377},global:{stubs:{ClientCoverageVerification:true}}});await w.find('button').trigger('click');await flushPromises();return w;}
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
