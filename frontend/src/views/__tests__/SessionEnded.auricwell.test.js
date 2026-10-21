import {beforeEach,expect,it,vi} from 'vitest';
import {mount} from '@vue/test-utils';
const state=vi.hoisted(()=>({query:{login:'/itsco/login'},params:{}}));
vi.mock('vue-router',()=>({useRoute:()=>state}));
vi.mock('../../utils/loginRedirect.js',()=>({getCurrentPortalSlugFromHostCache:()=>'',getCurrentPortalSlugFromPath:()=>''}));
import SessionEnded from '../SessionEndedView.vue';
beforeEach(()=>{sessionStorage.clear();state.query={login:'/itsco/login'};vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
it('shows AuricWell on a cold mobile session-ended page without cached tenant branding',()=>{const w=mount(SessionEnded);expect(w.text()).toContain('AuricWell');expect(w.find('img[alt="Plot Twist Co"]').exists()).toBe(false);expect(w.text()).not.toContain('inactivity');expect(w.get('button').text()).toBe('Log back in');expect(document.title).toContain('AuricWell');w.unmount();});
it('describes a failed verification without claiming the person was inactive',()=>{state.query.reason='verification';const w=mount(SessionEnded);expect(w.text()).toContain('could not verify your session');expect(w.text()).not.toContain('inactivity');w.unmount();});
