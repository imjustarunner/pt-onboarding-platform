import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
import Help from '../ProviderUpdateHelp.vue';
beforeEach(()=>vi.clearAllMocks());
it('submits the selected client context and description through the support ticket endpoint',async()=>{
 api.post.mockResolvedValue({data:{ticketId:71}});const w=mount(Help,{props:{base:'/public/provider-update/test',agencyId:2,client:{id:12,firstName:'Sample',schoolName:'Example School'}}});
 await w.get('button').trigger('click');await w.get('textarea').setValue('Possible duplicate record');await w.get('form').trigger('submit');await flushPromises();
 const [url,body]=api.post.mock.calls[0];expect(url).toBe('/public/provider-update/test/help-ticket');expect(body.get('clientId')).toBe('12');expect(body.get('question')).toBe('Possible duplicate record');expect(w.text()).toContain('Ticket #71');w.unmount();
});
it('does not send a ticket from a read-only preview',async()=>{const w=mount(Help,{props:{readonly:true,client:{id:12}}});await w.get('button').trigger('click');await w.get('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();w.unmount();});
