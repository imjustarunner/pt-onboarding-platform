import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import ClinicalNoteReadOnlyView from '../ClinicalNoteReadOnlyView.vue';
import { formatChartClinicalNoteCopy } from '../../../utils/noteAidUiHelpers.js';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{post:vi.fn()}}));
vi.mock('../../../store/auth.js',()=>({useAuthStore:()=>({user:{id:5,role:'provider'}})}));
const props={note:{id:4,agencyId:1,clinicalSessionId:2,providerSignedAt:'2026-09-20',noteType:'PROGRESS',sections:{assessment:'Progress'}}};
const field=(w,id)=>w.find(`[data-testid="${id}"]`);
async function prepare(w,kind='addendum'){
  await field(w,'entry-kind').setValue(kind);
  await w.find('textarea').setValue('Additional clinical context');
  await field(w,'entry-reason').setValue('Explains the entry');
}
beforeEach(()=>{vi.resetAllMocks();api.post.mockResolvedValue({data:{addenda:[{id:6,body:'Amended',created_by_user_id:5,entry_kind:'addendum',entry_reason:'Explains the entry',author_signed_at:'2026-09-24T12:00:00Z',created_at:'2026-09-24T12:00:00Z'}]}});});
describe('signed-note amendment flow',()=>{
  it.each(['addendum','late_entry'])('signs a %s without any code-change or claim-creation request',async kind=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w,kind);
    expect(field(w,'sign-entry').attributes('disabled')).toBeDefined();
    await field(w,'author-attestation').setValue(true);await field(w,'sign-entry').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/4/addenda',{agencyId:1,body:'Additional clinical context',entryKind:kind,reason:'Explains the entry',authorAttested:true});
    expect(w.text()).toContain('No claim was created or transmitted');expect(w.text()).toContain('Author signed');w.unmount();
  });
  it('requires a reason and renewed author attestation after editing',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w);await field(w,'author-attestation').setValue(true);
    await w.find('textarea').setValue('Changed text');expect(field(w,'author-attestation').element.checked).toBe(false);
    await field(w,'entry-reason').setValue('');await field(w,'author-attestation').setValue(true);
    expect(field(w,'sign-entry').attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('attests the complete corrected clinical service list without exposing fees to a provider',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w,'correction');await field(w,'service-correction').setValue(true);
    await w.find('input[maxlength="5"]').setValue('90834');await w.find('input[type=number]').setValue(1);
    await field(w,'service-attestation').setValue(true);await field(w,'author-attestation').setValue(true);
    await field(w,'sign-entry').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/4/addenda',{agencyId:1,body:'Additional clinical context',entryKind:'correction',reason:'Explains the entry',authorAttested:true,serviceLines:[{procedureCode:'90834',units:1}],serviceChangeAttested:true});
    expect(w.text()).not.toContain('Total line charge');w.unmount();
  });
  it('drops service changes and signature when switching back to an addendum',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w,'correction');await field(w,'service-correction').setValue(true);
    await field(w,'author-attestation').setValue(true);await field(w,'entry-kind').setValue('addendum');
    expect(field(w,'service-correction').exists()).toBe(false);expect(field(w,'author-attestation').element.checked).toBe(false);
    await field(w,'author-attestation').setValue(true);await field(w,'sign-entry').trigger('click');await flushPromises();
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('serviceLines');w.unmount();
  });
  it('clears unsaved text, reason and attestation when changing notes',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w);await field(w,'author-attestation').setValue(true);
    await w.setProps({note:{...props.note,id:9}});
    expect(w.find('textarea').element.value).toBe('');expect(field(w,'entry-reason').element.value).toBe('');expect(field(w,'author-attestation').element.checked).toBe(false);w.unmount();
  });
  it('copies the original alongside typed entries, reasons and signatures',()=>{
    const result=formatChartClinicalNoteCopy({note:{...props.note,needsSupervisorCosign:true,addenda:[{entryKind:'correction',body:'Corrected information',reason:'Original error',createdAt:'2026-09-24',createdByUserId:5,authorSignedAt:'2026-09-24T12:00:00Z'}]},panels:[{title:'Original',text:'Original signed information'}]});
    for(const text of ['Original signed information','Amendment / correction','Corrected information','Reason: Original error','user #5','Author signed: 2026-09-24T12:00:00Z','Supervisor approval pending'])expect(result).toContain(text);
  });
  it('does not display an entry response on a different note after navigation',async()=>{
    let resolve;api.post.mockReturnValue(new Promise(r=>{resolve=r;}));
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w);await field(w,'author-attestation').setValue(true);await field(w,'sign-entry').trigger('click');
    await w.setProps({note:{...props.note,id:9}});
    resolve({data:{addenda:[{id:6,body:'Previous note entry',entry_kind:'addendum'}]}});await flushPromises();
    expect(w.text()).not.toContain('Previous note entry');expect(w.text()).not.toContain('Entry signed;');w.unmount();
  });
});
