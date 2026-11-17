import {expect,it} from 'vitest';
import {mount} from '@vue/test-utils';
import Evidence from '../SchoolWeekdayCompletionEvidence.vue';
it('makes the historical save evidence separate from an explicit weekday confirmation',()=>{
 const w=mount(Evidence,{props:{progress:{savedAt:'2026-11-10T22:33:08Z',savedByProvider:true,explicitlyConfirmed:false,dayEvidence:[{day:'Wednesday',status:'available'}]}}});
 expect(w.text()).toContain('Nov 10, 3:33 PM Mountain');expect(w.text()).toContain('provider account');expect(w.text()).toContain('before explicit weekday confirmation');expect(w.text()).toContain('Wednesday: Saved Available');w.unmount();
});
it('distinguishes fully assigned weekdays without claiming a provider submitted a form',()=>{
 const w=mount(Evidence,{props:{progress:{completionBasis:'assignments',dayEvidence:[]}}});expect(w.text()).toContain('No form save is recorded');expect(w.text()).not.toContain('provider account');w.unmount();
});
