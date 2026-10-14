import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Planner from '../AuricwellCostPlanner.vue';
import Pricing from '../AuricwellPricingTable.vue';
import {pricingTables} from '../../../auricwell/website/pricing.mjs';
describe('AuricWell pricing presentation',()=>{
  it('updates practice totals and allowance thresholds when tier, staff and usage change',async()=>{
    const w=mount(Planner);
    expect(w.find('.totals').text()).toContain('$49.00');
    await w.find('select').setValue('premium');
    const independent=w.findAll('label').find(l=>l.text().startsWith('Independently billing providers'));
    await independent.find('input').setValue(2);
    expect(w.find('.totals').text()).toContain('$217.00');
    const video=w.findAll('label').find(l=>l.text().startsWith('Video participant-minutes'));
    await video.find('input').setValue(2300);
    expect(w.find('.totals').text()).toContain('$1.20');expect(w.find('.totals').text()).toContain('$218.20');
  });
  it('makes usage units, supervised qualification and included support visible',()=>{
    const text=mount(Pricing).text();expect(text).toContain('$20');expect(text).toContain('$40');expect(text).toContain('$0.012');expect(text).toContain('Supervision attendance alone does not qualify');expect(text).toContain('In-app and standard transactional email notifications are included');
  });
  it('uses the same rates on the static website and links the reviewed agreements',()=>{
    const html=pricingTables();expect(html).toContain('$49');expect(html).toContain('$149');expect(html).toContain('$0.012');expect(html).toContain('business-associate-agreement.html');expect(html).toContain('per clinical seat');
  });
});
