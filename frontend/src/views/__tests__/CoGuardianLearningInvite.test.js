import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../public/CoGuardianInviteView.vue';
import api from '../../services/api';
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'synthetic-invite',agencySlug:'nlu-qa-demo',serviceType:'tutoring'}})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let w;
const invite=()=>({source:'learning_portal',agency:{name:'Next Level Up',slug:'nlu-qa-demo'},dependents:[{id:2545,firstName:'Parker'}],contact:{firstName:'Rene',lastName:'QA',email:'qa.nlu.coparent@example.com'}});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{invite:invite()}});api.post.mockResolvedValue({data:{portalAccess:{email:'qa.nlu.coparent@example.com',portalPath:'/nlu-qa-demo/guardian',existingAccount:false,setupEmailSent:true}}});});
afterEach(()=>w?.unmount());
it('accepts a learning invitation without offering a clinical intake or generic password-email shortcut',async()=>{
 w=mount(View);await flushPromises();expect(w.text()).toContain('Accept your learning portal invitation');expect(w.text()).not.toContain('legal rights');expect(w.get('input[type=email]').attributes('readonly')).toBeDefined();expect(w.find('input[type=tel]').exists()).toBe(false);
 await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('Check your email for your password setup link');expect(w.text()).toContain('Private documents, plans and ratings are shared separately');
 expect(w.text()).not.toContain('Use the password you already have');expect(w.text()).not.toContain('intake');expect(w.findAll('button')).toHaveLength(0);expect(w.get('a').attributes('href')).toBe('/nlu-qa-demo/guardian');expect(api.post).toHaveBeenCalledTimes(1);
});
it('reports unavailable setup delivery without claiming a new account has an existing password',async()=>{
 api.post.mockResolvedValue({data:{portalAccess:{email:'qa.nlu.coparent@example.com',portalPath:'/nlu-qa-demo/guardian',existingAccount:false,setupEmailSent:false,deliveryStatus:'failed'}}});
 w=mount(View);await flushPromises();await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('needs delivery review');expect(w.text()).not.toContain('Use the password you already have');
});
it('preserves the clinical invitation intake and existing account behavior',async()=>{
 api.get.mockResolvedValue({data:{invite:{...invite(),source:'office',publicKey:'synthetic-clinical-form'}}});api.post.mockResolvedValue({data:{portalAccess:{email:'qa.parent@example.com',portalPath:'/guardian',existingAccount:true}}});
 w=mount(View);await flushPromises();expect(w.text()).toContain('Complete your guardian information');expect(w.text()).toContain('legal rights');expect(w.find('input[type=tel]').exists()).toBe(true);
 await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('Use the password you already have');expect(w.text()).toContain('Continue to the full intake packet');expect(w.text()).toContain('Email these login details');
});
