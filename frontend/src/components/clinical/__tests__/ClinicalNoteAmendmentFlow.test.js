import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import ClinicalNoteReadOnlyView from '../ClinicalNoteReadOnlyView.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{post:vi.fn()}}));
vi.mock('../../../store/auth.js',()=>({useAuthStore:()=>({user:{id:5,role:'provider'}})}));
const props={note:{id:4,agencyId:1,clinicalSessionId:2,providerSignedAt:'2026-09-20',noteType:'PROGRESS',sections:{assessment:'Progress'}}};
beforeEach(()=>{vi.resetAllMocks();api.post.mockResolvedValue({data:{addenda:[{id:6,body:'Amended',created_by_user_id:5}]}});});
describe('signed-note amendment flow',()=>{
  it('submits narrative-only addenda without any code-change or claim-creation request',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await w.find('textarea').setValue('Added clinical context');await w.findAll('button').find(b=>b.text()==='Attach addendum').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/4/addenda',{agencyId:1,body:'Added clinical context'});expect(w.text()).toContain('No claim was created or transmitted');w.unmount();
  });
  it('attests the complete corrected clinical service list without exposing fees to a provider',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await w.find('textarea').setValue('Corrected session duration');await w.find('input[type=checkbox]').setValue(true);await w.find('input[maxlength="5"]').setValue('90834');await w.find('input[type=number]').setValue(1);await w.findAll('input[type=checkbox]')[1].setValue(true);await w.findAll('button').find(b=>b.text()==='Attach addendum').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/4/addenda',{agencyId:1,body:'Corrected session duration',serviceLines:[{procedureCode:'90834',units:1}],serviceChangeAttested:true});expect(w.text()).not.toContain('Total line charge');w.unmount();
  });
});
