import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import ClinicalNoteReadOnlyView from '../ClinicalNoteReadOnlyView.vue';
import { formatChartClinicalNoteCopy } from '../../../utils/noteAidUiHelpers.js';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{post:vi.fn()}}));
vi.mock('../ClinicalNoteVersionHistory.vue',()=>({default:{template:'<section>Immutable note versions</section>'}}));
vi.mock('../../../store/auth.js',()=>({useAuthStore:()=>({user:{id:5,role:'provider'}})}));
const props={note:{id:4,agencyId:1,clinicalSessionId:2,providerSignedAt:'2026-09-20',noteType:'PROGRESS',sections:{assessment:'Progress'}}};
const field=(w,id)=>w.find(`[data-testid="${id}"]`);
async function prepare(w,kind='addendum'){
  if(field(w,'create-addendum').attributes('aria-expanded')!=='true')await field(w,'create-addendum').trigger('click');
  await field(w,'entry-kind').setValue(kind);
  await w.find('textarea').setValue('Additional clinical context');
  await field(w,'entry-reason').setValue('Explains the entry');
}
beforeEach(()=>{vi.resetAllMocks();api.post.mockResolvedValue({data:{addenda:[{id:6,body:'Amended',created_by_user_id:5,entry_kind:'addendum',entry_reason:'Explains the entry',author_signed_at:'2026-09-24T12:00:00Z',created_at:'2026-09-24T12:00:00Z'}]}});});
describe('signed-note amendment flow',()=>{
  it('keeps the addendum editor closed until requested and preserves its text while folded',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{attachTo:document.body,props});expect(field(w,'addendum-editor').isVisible()).toBe(false);
    await prepare(w);expect(field(w,'addendum-editor').isVisible()).toBe(true);
    await field(w,'create-addendum').trigger('click');expect(field(w,'addendum-editor').isVisible()).toBe(false);
    await field(w,'create-addendum').trigger('click');expect(w.find('textarea').element.value).toBe('Additional clinical context');expect(api.post).not.toHaveBeenCalled();w.unmount();
  });

  it('labels the original signature as version 1 and gives independent additions their own attestation',()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props:{note:{...props.note,clinicalVersion:{revisionNumber:2},attestation:{statement:'DEMO QA original author signature'}}}});
    expect(w.text()).toContain('original author signature below belongs to version 1');
    const label=field(w,'author-attestation').element.closest('label').textContent;
    expect(label).toContain('electronically sign');expect(label).not.toContain('supervisor approval');w.unmount();
  });
  it('shows appointment and session IDs with saved UTC timing in the appointment timezone',()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props:{note:{...props.note,clinicalSessionId:192,sessionTiming:{appointmentId:114,startAt:'2026-11-01 17:00:00',endAt:'2026-11-01 18:00:00',sourceTimezone:'America/Denver',durationMinutes:60,locationLabel:'Telehealth'}}}});
    expect(w.text()).toContain('#114');expect(w.text()).toContain('#192');expect(w.text()).toContain('10:00 AM');expect(w.text()).toContain('11:00 AM');expect(w.text()).toContain('America/Denver');expect(w.text()).toContain('60 min');w.unmount();
  });
  it('retains an earlier supervisor signature while a new addition awaits review and after reload',async()=>{
    const cosign={statement:'Original supervisor signed statement',cosignedAt:'2026-11-01T19:15:00Z',cosignedByUserId:8,contentHash:'original'};
    const w=mount(ClinicalNoteReadOnlyView,{props:{note:{...props.note,supervisorCosign:cosign,supervisorCosignedAt:cosign.cosignedAt}}});
    await prepare(w);await field(w,'author-attestation').setValue(true);await field(w,'sign-entry').trigger('click');await flushPromises();
    expect(w.text()).toContain('Earlier signed version');expect(w.text()).toContain(cosign.statement);expect(w.text()).toContain('Later additions');
    const reloaded={...props.note,addenda:[{id:6,body:'Amended'}],needsSupervisorCosign:true,metadata:{supervisorCosignHistory:[cosign]}};
    await w.setProps({note:reloaded});expect(w.text()).toContain(cosign.statement);
    const copy=formatChartClinicalNoteCopy({note:reloaded});expect(copy).toContain(cosign.statement);expect(copy).toContain('Supervisor approval pending');
    await w.setProps({note:{...reloaded,supervisorCosignedAt:'2026-11-01T19:25:00Z',needsSupervisorCosign:false,supervisorCosign:{statement:'Current supervisor signed statement'}}});
    expect(w.text()).toContain(cosign.statement);expect(w.text()).toContain('Current supervisor signed statement');w.unmount();
  });

  it.each(['addendum','late_entry'])('signs a %s without any code-change or claim-creation request',async kind=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w,kind);
    expect(field(w,'sign-entry').attributes('disabled')).toBeDefined();
    await field(w,'author-attestation').setValue(true);await field(w,'sign-entry').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/4/addenda',{agencyId:1,body:'Additional clinical context',entryKind:kind,reason:'Explains the entry',authorAttested:true},{skipGlobalLoading:true});
    expect(w.text()).toContain('No claim was created or transmitted');expect(w.text()).toContain('Author signed');w.unmount();
  });
  it('requires a reason and renewed author attestation after editing',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});await prepare(w);await field(w,'author-attestation').setValue(true);
    await w.find('textarea').setValue('Changed text');expect(field(w,'author-attestation').element.checked).toBe(false);
    await field(w,'entry-reason').setValue('');await field(w,'author-attestation').setValue(true);
    expect(field(w,'sign-entry').attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('keeps separate additions distinct from replacement amendments',async()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props});
    expect(field(w,'entry-kind').findAll('option').map(option=>option.element.value)).toEqual(['addendum','late_entry']);
    expect(w.text()).toContain('Use Create amendment in Note versions');
    expect(field(w,'service-correction').exists()).toBe(false);w.unmount();
  });
  it('does not expose clinical addition signatures when the server denies them',()=>{
    const w=mount(ClinicalNoteReadOnlyView,{props:{note:{...props.note,canSignAddendum:false}}});
    expect(field(w,'author-attestation').exists()).toBe(false);expect(field(w,'sign-entry').exists()).toBe(false);w.unmount();
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
