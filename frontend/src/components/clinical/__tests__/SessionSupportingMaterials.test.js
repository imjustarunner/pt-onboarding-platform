import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionSupportingMaterials from '../SessionSupportingMaterials.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const parents = [{ id: 20, kind: 'guardian', name: 'First Parent' }, { id: 21, kind: 'guardian', name: 'Second Parent' }];
const clean = { id: 8, title: 'CBT worksheet', mimeType: 'application/pdf', available: true, scanStatus: 'clean', sharedWith: [] };
async function open(wrapper) { wrapper.find('details').element.open = true; await wrapper.find('details').trigger('toggle'); await flushPromises(); }
async function chooseFile(wrapper) {
  await wrapper.find('input[maxlength="255"]').setValue('CBT worksheet');
  const file = new File(['%PDF-synthetic'], 'worksheet.pdf', { type: 'application/pdf' });
  Object.defineProperty(wrapper.find('input[type=file]').element, 'files', { value: [file], configurable: true });
  await wrapper.find('input[type=file]').trigger('change');
}
const field = (w, id) => w.find(`[data-testid="${id}"]`);
it('refreshes a queued private scan without posting another job or sharing the file',async()=>{
 api.get.mockResolvedValue({data:[{...clean,available:false,scanStatus:'pending',scanQueued:true}]});
 const w=mount(SessionSupportingMaterials,{props:{clinicalSessionId:166}});await open(w);
 const refresh=w.findAll('button').find(b=>b.text()==='Refresh scan status');expect(refresh).toBeTruthy();await refresh.trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledTimes(2);expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();w.unmount();
});
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/recipients') ? parents : [] }));
  api.post.mockResolvedValue({ data: { ...clean } }); api.put.mockResolvedValue({ data: { sharedWith: [{ id: 20, name: 'First Parent' }] } });
  api.delete.mockResolvedValue({ data: { revoked: true, recipientId: 20 } });
});
describe('session supporting materials', () => {
  it('stays collapsed and loads clinical materials only after the disclosure opens', async () => {
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } });
    expect(api.get).not.toHaveBeenCalled(); expect(w.find('form').exists()).toBe(false);
    await open(w); expect(api.get).toHaveBeenCalledWith('/clinical-data/sessions/166/materials'); expect(w.text()).toContain('Add session materials'); w.unmount();
  });
  it('defaults to care-team-only and never silently shares with guardians', async () => {
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await chooseFile(w);
    expect(field(w, 'include-client-documents').element.checked).toBe(false);
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/clinical-data/sessions/166/materials', expect.any(FormData));
    const data = api.post.mock.calls[0][1]; expect(data.get('title')).toBe('CBT worksheet'); expect(data.get('file').name).toBe('worksheet.pdf');
    expect(api.put).not.toHaveBeenCalled(); expect(w.text()).toContain('Saved for this session’s care team.'); w.unmount();
  });
  it('requires explicit recipient choices and a file review before portal sharing', async () => {
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await chooseFile(w);
    await field(w, 'include-client-documents').setValue(true); await flushPromises();
    expect(field(w, 'material-recipient-20').element.checked).toBe(false); expect(field(w, 'material-recipient-21').element.checked).toBe(false);
    expect(field(w, 'upload-session-material').attributes('disabled')).toBeDefined();
    await field(w, 'material-recipient-20').setValue(true); await field(w, 'material-sharing-reviewed').setValue(true);
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/clinical-data/sessions/166/materials/8/sharing', { recipientIds: [20], reviewed: true });
    expect(w.text()).toContain('In client Documents for: First Parent'); expect(w.text()).not.toContain('In client Documents for: Second Parent'); w.unmount();
  });
  it('can explicitly select all eligible guardians and resets attestation after recipient changes', async () => {
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await chooseFile(w);
    await field(w, 'include-client-documents').setValue(true); await flushPromises(); await field(w, 'all-guardians').setValue(true);
    expect(field(w, 'material-recipient-20').element.checked).toBe(true); expect(field(w, 'material-recipient-21').element.checked).toBe(true);
    await field(w, 'material-sharing-reviewed').setValue(true); await field(w, 'material-recipient-21').setValue(false);
    expect(field(w, 'material-sharing-reviewed').element.checked).toBe(false); w.unmount();
  });
  it('shows pending encrypted uploads honestly and never sends a share request', async () => {
    api.post.mockResolvedValue({ data: { ...clean, available: false, scanStatus: 'pending' } });
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await chooseFile(w);
    await field(w, 'include-client-documents').setValue(true); await flushPromises(); await field(w, 'material-recipient-20').setValue(true); await field(w, 'material-sharing-reviewed').setValue(true);
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api.put).not.toHaveBeenCalled(); expect(w.text()).toContain('This file has not been shared and cannot be opened yet.');
    expect(w.findAll('button').some(b => b.text() === 'CBT worksheet')).toBe(false); w.unmount();
  });
  it('allows a private rescan followed by an explicit share without reuploading the file', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/recipients') ? parents : [{ ...clean, available: false, scanStatus: 'pending' }] }));
    api.post.mockResolvedValue({ data: { available: true, scanStatus: 'clean' } });
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w);
    await w.findAll('button').find(b => b.text() === 'Retry private security scan').trigger('click'); await flushPromises();
    await w.findAll('button').find(b => b.text() === 'Share in client Documents…').trigger('click'); await flushPromises();
    await field(w, 'material-recipient-20').setValue(true); await field(w, 'material-sharing-reviewed').setValue(true);
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/clinical-data/sessions/166/materials/8/scan');
    expect(api.put).toHaveBeenCalledWith('/clinical-data/sessions/166/materials/8/sharing', { recipientIds: [20], reviewed: true }); w.unmount();
  });
  it('does not display another session’s delayed load or upload response after navigation', async () => {
    let finish; api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); w.find('details').element.open = true; await w.find('details').trigger('toggle');
    await w.setProps({ clinicalSessionId: 167 }); await flushPromises(); finish({ data: [{ ...clean, title: 'Previous client PHI' }] }); await flushPromises();
    expect(w.text()).not.toContain('Previous client PHI'); expect(api.get).toHaveBeenCalledWith('/clinical-data/sessions/167/materials');
    await chooseFile(w); let saved; api.post.mockReturnValueOnce(new Promise(resolve => { saved = resolve; })); await w.find('form').trigger('submit');
    await w.setProps({ clinicalSessionId: 168 }); saved({ data: { ...clean, title: 'Previous upload PHI' } }); await flushPromises();
    expect(w.text()).not.toContain('Previous upload PHI'); expect(api.put).not.toHaveBeenCalled(); w.unmount();
  });
  it('retains the encrypted material but reports sharing failures without claiming delivery', async () => {
    api.put.mockRejectedValue({ response: { data: { error: { message: 'Recipient permission changed.' } } } });
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await chooseFile(w);
    await field(w, 'include-client-documents').setValue(true); await flushPromises(); await field(w, 'material-recipient-20').setValue(true); await field(w, 'material-sharing-reviewed').setValue(true);
    await w.find('form').trigger('submit'); await flushPromises(); expect(w.text()).toContain('The encrypted material was saved. Sharing was not completed');
    expect(w.find('[role=alert]').text()).toContain('Recipient permission changed.'); expect(w.text()).not.toContain('selected people can access'); w.unmount();
  });
  it.each([true,false])('removes only the selected recipient’s access and retains a material when available=%s', async available => {
    const sharingRecipients = parents.map(({ id, name }) => ({ id, name }));
    api.get.mockResolvedValue({ data: [{ ...clean, available, scanStatus: available ? 'clean' : 'pending', sharedWith: available ? [...sharingRecipients] : [], sharingRecipients: [...sharingRecipients] }] });
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w);
    await field(w,'revoke-material-8-20').trigger('click'); await flushPromises();
    expect(api.delete).toHaveBeenCalledExactlyOnceWith('/clinical-data/sessions/166/materials/8/sharing/20');
    expect(field(w,'revoke-material-8-20').exists()).toBe(false); expect(field(w,'revoke-material-8-21').exists()).toBe(true);
    expect(w.text()).toContain('CBT worksheet'); expect(w.text()).toContain('The session attachment remains stored.'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('retains the displayed access grant when revocation fails', async () => {
    api.get.mockResolvedValue({ data: [{ ...clean, sharedWith: [{ id:20,name:'First Parent' }] }] });
    api.delete.mockRejectedValue({ response: { data: { error: { message:'Your clinical access changed.' } } } });
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w);
    await field(w,'revoke-material-8-20').trigger('click'); await flushPromises();
    expect(field(w,'revoke-material-8-20').exists()).toBe(true); expect(w.find('[role=alert]').text()).toContain('Your clinical access changed.'); expect(w.text()).not.toContain('Portal access removed'); w.unmount();
  });
  it('does not apply a delayed removal response after switching sessions', async () => {
    let finish;
    api.get.mockResolvedValueOnce({ data: [{ ...clean, sharedWith: [{ id:20,name:'First Parent' }] }] });
    api.delete.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    const w = mount(SessionSupportingMaterials, { props: { clinicalSessionId: 166 } }); await open(w); await field(w,'revoke-material-8-20').trigger('click');
    await w.setProps({ clinicalSessionId:167 }); await flushPromises(); finish({ data:{ revoked:true,recipientId:20 } }); await flushPromises();
    expect(w.text()).not.toContain('Portal access removed'); expect(w.text()).not.toContain('First Parent'); w.unmount();
  });
});

it('uses an explicitly supplied local transport without touching the authenticated API', async()=>{
  vi.clearAllMocks();const local={get:vi.fn(async()=>({data:[]})),post:vi.fn(),put:vi.fn()};
  const w=mount(SessionSupportingMaterials,{props:{clinicalSessionId:990701,transport:local}});
  await open(w);expect(local.get).toHaveBeenCalledWith('/clinical-data/sessions/990701/materials');
  expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
