import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi} from 'vitest';
import ClientContactEmail from '../ClientContactEmail.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{put:vi.fn()}}));
it('saves only the contact address with its original value in the selected chart',async()=>{
  api.put.mockResolvedValue({data:{clientId:8,agencyId:2,email:'new@example.test'}});
  const w=mount(ClientContactEmail,{props:{clientId:8,agencyId:2,email:null,editable:true}});
  await w.get('button').trigger('click');
  await w.get('input').setValue('new@example.test');await w.get('form').trigger('submit');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/clients/8/contact-email',{email:'new@example.test',previousEmail:''},expect.objectContaining({params:{agencyId:2}}));
  expect(w.emitted('saved')[0][0]).toMatchObject({clientId:8,email:'new@example.test'});w.unmount();
});
