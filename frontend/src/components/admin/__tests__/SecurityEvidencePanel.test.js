import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SecurityEvidencePanel from '../SecurityEvidencePanel.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
const row = {id:1,user_id:507,actor_email:'rachel@example.com',actor_role:'admin',request_id:'request-123',session_ref:'a'.repeat(64),client_ip:'192.3.22.175',ip_source:'unverified_proxy',occurred_at:'2026-09-16T12:00:00Z',action:'download_link_issued',outcome:'issued',phase:'completed',method:'GET',route:'/api/documents/8',response_bytes:200};
beforeEach(() => { vi.resetAllMocks(); api.get.mockImplementation(async url => url.endsWith('/signals') ? {data:{highVolume:[],incompleteRequests:0}} : {data:{items:[row],coverage:{first_event:'2026-09-16T10:00:00Z'},proxyMode:'unverified'}}); });
describe('security investigation evidence presentation', () => {
  it('requires a new search after editing filters before exporting a snapshot', async () => {
    const w=mount(SecurityEvidencePanel, { global: { stubs: { RouterLink: true } } });await flushPromises();const exportButton=w.findAll('button').find(b=>b.text()==='Export evidence');expect(exportButton.attributes('disabled')).toBeUndefined();await w.find('.investigation-filters input').setValue('someone@example.invalid');expect(exportButton.attributes('disabled')).toBeDefined();expect(w.text()).toContain('Search to apply the edited filters');
  });
  it('explains link issuance and proxy uncertainty without claiming a download', async () => {
    const w=mount(SecurityEvidencePanel, { global: { stubs: { RouterLink: true } } }); await flushPromises(); expect(w.text()).toContain('Link issued'); expect(w.text()).toContain('Unverified / may be a proxy'); expect(w.text()).toContain('retrieval needs storage evidence'); expect(w.text()).not.toContain('Document downloaded');
  });
  it('shows storage errors as failures rather than a clean investigation', async () => {
    api.get.mockRejectedValue({response:{data:{error:{message:'Evidence unavailable'}}}}); const w=mount(SecurityEvidencePanel, { global: { stubs: { RouterLink: true } } }); await flushPromises(); expect(w.get('[role="alert"]').text()).toBe('Evidence unavailable');
  });
  it('filters by the selected user and shows request stages', async () => {
    const w=mount(SecurityEvidencePanel, { global: { stubs: { RouterLink: true } } }); await flushPromises(); const button=w.findAll('button').find(b=>b.text()==='This user'); await button.trigger('click'); await flushPromises(); expect(api.get.mock.calls.at(-1)[1].params.userId).toBe('507');
    api.get.mockResolvedValueOnce({data:{items:[{...row,phase:'authenticated'}]}}); await w.findAll('button').find(b=>b.text()==='Details').trigger('click'); await flushPromises(); expect(w.text()).toContain('Account verified');
  });
  it('requires user-ID confirmation before revoking sessions', async () => {
    const w=mount(SecurityEvidencePanel, { global: { stubs: { RouterLink: true } } }); await flushPromises(); await w.findAll('button').find(b=>b.text()==='Details').trigger('click'); await flushPromises(); await w.findAll('button').find(b=>b.text()==='End all app sessions for this user').trigger('click');
    const confirm=w.findAll('button').find(b=>b.text()==='Confirm and end sessions'); expect(confirm.attributes('disabled')).toBeDefined(); await w.find('.revoke input').setValue('507'); expect(confirm.attributes('disabled')).toBeUndefined();
    api.post.mockResolvedValue({data:{message:'Sessions ended'}}); await w.find('form.revoke').trigger('submit.prevent'); await flushPromises(); expect(api.post).toHaveBeenCalledWith('/security-evidence/users/507/revoke',{confirmUserId:'507'});
  });
  it('distinguishes metadata-only checks from partial file responses', async () => {
    api.get.mockImplementation(async url => url.endsWith('/signals') ? {data:{highVolume:[],incompleteRequests:0}} : {data:{items:[
      {...row,action:'file_metadata',outcome:'metadata_only',response_bytes:0,details:{transfer:{bodyPermitted:false}}},
      {...row,id:2,action:'file_response',outcome:'response_sent',response_bytes:5,details:{transfer:{bodyPermitted:true,partial:true,rangeStart:5,rangeEnd:9,resourceBytes:100}}}
    ],coverage:{},proxyMode:'unverified'}});
    const w=mount(SecurityEvidencePanel,{global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(w.text()).toContain('File metadata request');expect(w.text()).toContain('No response body was sent.');
    expect(w.text()).toContain('Partial file response. Bytes 5–9 of 100.');
    expect(w.text()).toContain('does not establish delivery of the whole file');w.unmount();
  });
});
