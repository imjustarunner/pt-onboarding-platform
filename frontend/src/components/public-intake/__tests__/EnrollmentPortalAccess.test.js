import { it,expect,vi,beforeEach } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
import api from '../../../services/api';
import Portal from '../EnrollmentPortalAccess.vue';
import Brand from '../../digital-form/EnrollmentBrand.vue';
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{username:'parent@example.test',portalLoginUrl:'https://agency.test/login'}});});
const props={publicKey:'packet',submissionId:12,sessionToken:'session',language:'en'};
it('makes school portal setup optional and contacts the server only after the parent requests it',async()=>{
 const w=mount(Portal,{props:{...props,optional:true}});await flushPromises();
 expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('Your enrollment is complete');
 expect(w.text()).toContain('not required to receive services');
 api.post.mockResolvedValue({data:{username:'parent@example.test',portalLoginUrl:'https://agency.test/login',deliveryStatus:'sent'}});
 await w.get('button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith('/public-intake/packet/12/portal-credentials',{sessionToken:'session',sendSetupEmail:true},expect.any(Object));
 expect(w.text()).toContain('Setup link sent');w.unmount();
});
it('offers optional school password setup in Spanish',async()=>{
 const w=mount(Portal,{props:{...props,optional:true,language:'es'}});await flushPromises();
 expect(w.text()).toContain('Acceso opcional');expect(w.text()).toContain('Su inscripción está completa');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('opens with non-secret portal details and sends setup only on request',async()=>{const w=mount(Portal,{props});await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][1]).toEqual({sessionToken:'session',sendSetupEmail:false});expect(w.get('a').attributes('href')).toBe('https://agency.test/login');api.post.mockResolvedValue({data:{username:'parent@example.test',portalLoginUrl:'https://agency.test/login',deliveryStatus:'sent'}});await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('Setup link sent');expect(api.post.mock.calls[1][1]).toEqual({sessionToken:'session',sendSetupEmail:true});w.unmount();});
it('does not label failed or pending delivery as sent',async()=>{const w=mount(Portal,{props});await flushPromises();api.post.mockResolvedValue({data:{username:'parent@example.test',portalLoginUrl:'https://agency.test/login',deliveryStatus:'pending'}});await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('could not confirm delivery');expect(w.text()).not.toContain('Setup link sent');w.unmount();});
it('uses Spanish and shows all three school enrollment brands',async()=>{const w=mount(Portal,{props:{...props,language:'es'}});await flushPromises();expect(w.text()).toContain('Su portal');w.unmount();const b=mount(Brand,{props:{agencyName:'ITSCO',language:'es',branding:{enrollmentProduct:'auricwell',schoolCareBridge:true}}});for(const text of ['ITSCO','SchoolCareBridge','AuricWell','Coordinación escolar','Portal clínico'])expect(b.text()).toContain(text);});
