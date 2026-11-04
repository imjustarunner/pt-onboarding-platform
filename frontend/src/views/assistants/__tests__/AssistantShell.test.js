import { mount, flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import App from '../../../App.vue';
const {workspaceMounted}=vi.hoisted(()=>({workspaceMounted:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'assistant',email:'payroll-assistant@example.test'},isAuthenticated:true,logout:vi.fn()})}));
vi.mock('vue-router',()=>({useRoute:()=>({meta:{}})}));
vi.mock('../../../AppWorkspace.vue',()=>({default:{setup(){workspaceMounted();},template:'<div>Employee widgets</div>'}}));
it('never mounts the ordinary employee workspace for an assistant',async()=>{const wrapper=mount(App,{global:{stubs:{RouterView:{template:'<div>Scoped dashboard</div>'},RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();expect(wrapper.text()).toContain('Scoped dashboard');expect(wrapper.text()).not.toContain('Employee widgets');expect(workspaceMounted).not.toHaveBeenCalled();wrapper.unmount();});
