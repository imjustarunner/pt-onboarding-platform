import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Panel from '../NarrivaCompliancePanel.vue';
describe('Narriva longitudinal clinical review prompts',()=>{
  it('presents evidence and a clinician recommendation without granting verification',()=>{
    const wrapper=mount(Panel,{props:{review:{status:'pending',longitudinal:{status:'available',advisories:[{id:'trend',message:'Three comparable scores show no change.',recommendation:'Review current goals and barriers with the client.'}]}}}});
    const panel=wrapper.get('[aria-label="Treatment progress review"]');
    expect(panel.text()).toContain('Three comparable scores');expect(panel.text()).toContain('Review current goals');
    expect(panel.text()).toContain('requires clinical judgment');expect(wrapper.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);
  });
  it('does not call unavailable history a clean progress check',()=>{
    const wrapper=mount(Panel,{props:{review:{status:'pending',longitudinal:{status:'unavailable',advisories:[]}}}});
    expect(wrapper.get('[aria-label="Treatment progress review"] [role="status"]').text()).toContain('not confirmation of progress');
  });
});
