import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import OfficeBrand from '../OfficeBrand.vue';
import {officeAccent} from '../../../utils/officeBranding';
it('switches from an EHR office to tenant branding without retaining AuricWell',async()=>{
 const w=mount(OfficeBrand,{props:{branding:{officeProduct:'auricwell',agencyName:'Clinical Practice',agencyLogoUrl:'/clinical.svg'}}});
 expect(w.text()).toContain('AuricWell');expect(w.find('img[alt="Clinical Practice logo"]').exists()).toBe(true);
 await w.setProps({branding:{officeProduct:'tenant',agencyName:'Learning Center',agencyLogoUrl:'/learning.svg',colorPalette:{primary:'#884499'}}});
 expect(w.text()).not.toContain('AuricWell');expect(w.text()).toContain('My Virtual Office');expect(w.text()).toContain('Learning Center');
 expect(w.findAll('img')).toHaveLength(1);expect(w.find('img').attributes('src')).toBe('/learning.svg');
 expect(w.attributes('style')).toContain('#884499');w.unmount();
});
it('does not assume AuricWell before the organization is known',()=>{
 const w=mount(OfficeBrand);expect(w.text()).toBe('My Virtual Office');expect(w.findAll('img')).toHaveLength(0);w.unmount();
 expect(officeAccent({officeProduct:'tenant',colorPalette:{primary:'url(unsafe)'}})).toBe('#315c66');
});
