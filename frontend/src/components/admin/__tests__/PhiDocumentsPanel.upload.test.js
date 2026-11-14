import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const actor = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: actor }) }));
import Panel from '../PhiDocumentsPanel.vue';
let wrapper;
beforeEach(() => { vi.resetAllMocks();actor.role='admin';api.get.mockResolvedValue({ data: [] }); api.post.mockResolvedValue({ data: {} }); });
afterEach(() => wrapper?.unmount());
async function select(files) {
  wrapper = mount(Panel, { props: { clientId: 30, section: 'files', ownOnly: true } }); await flushPromises();
  const input = wrapper.find('input[type=file]'); Object.defineProperty(input.element, 'files', { value: files });
  await input.trigger('change'); await flushPromises();
}
it('uploads a 16 MB packet as its original multipart file', async () => {
  const file = new File(['synthetic'], 'packet.pdf', { type: 'application/pdf' }); Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 });
  await select([file]);
  expect(wrapper.text()).toContain('25 MB per file');
  expect(api.post).toHaveBeenCalledTimes(1); expect(api.post.mock.calls[0][0]).toBe('/phi-documents/clients/30/upload');
  expect(api.post.mock.calls[0][1].get('file').name).toBe('packet.pdf');
});
it('rejects an oversized selection before uploading any of its files', async () => {
  const small = new File(['synthetic'], 'small.pdf', { type: 'application/pdf' });
  const large = new File(['synthetic'], 'large.pdf', { type: 'application/pdf' }); Object.defineProperty(large, 'size', { value: 26 * 1024 * 1024 });
  await select([small, large]);
  expect(api.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('No files were uploaded.');
});
it('keeps a saved file visible as a follow-up problem instead of encouraging a duplicate upload',async()=>{api.post.mockResolvedValue({data:{document:{id:4364},operationalFollowupPending:true}});await select([new File(['synthetic'],'school-file.pdf',{type:'application/pdf'})]);expect(api.post).toHaveBeenCalledOnce();expect(wrapper.text()).toContain('The file was saved, but Support follow-up is pending');expect(wrapper.text()).toContain('Do not upload it again');});
it('explains an own-upload-only school document list without implying that no packet exists',async()=>{
 actor.role='school_staff';wrapper=mount(Panel,{props:{clientId:30,section:'files',ownOnly:true}});await flushPromises();expect(wrapper.text()).toContain('This ROI level only allows documents you uploaded');expect(wrapper.text()).not.toContain('No packets found');expect(api.get).toHaveBeenCalledWith('/phi-documents/clients/30');expect(api.get.mock.calls.some(([path])=>path.includes('enrollment-receipts'))).toBe(false);
});
it('retains the ordinary empty list message outside the restricted school view',async()=>{wrapper=mount(Panel,{props:{clientId:30,section:'files'}});await flushPromises();expect(wrapper.text()).toContain('No packets found');expect(wrapper.text()).not.toContain('This ROI level only allows');});
it('preserves a school document denial without treating it as an empty receipt list or requesting another document scope',async()=>{
 actor.role='school_staff';api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Not authorized'}}}});wrapper=mount(Panel,{props:{clientId:30,section:'files',ownOnly:true}});await flushPromises();expect(wrapper.text()).toContain('Other referral documents are not available with your current access');expect(wrapper.text()).not.toContain('No packets found');expect(api.get).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
});
