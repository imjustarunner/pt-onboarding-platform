import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Price from '../TutoringSessionPrice.vue';
const props={canSet:true,quote:{amountCents:5000,rateCents:5000,rateUnit:'hour',source:'learning-tier-or-override'},durationMinutes:60,formatLabel:'Virtual',contextKey:'453:1496:320:2545'};
it('shows the tutor rate source and accepts a one-dollar session price',async()=>{
 const w=mount(Price,{props});expect(w.text()).toContain('Tutor’s assigned tier or format override');expect(w.text()).toContain('$50.00 per hour');
 await w.findAll('input[type=radio]')[1].setValue();await w.get('[aria-label="Custom session price in dollars"]').setValue('1.00');await w.get('[aria-label="Reason for custom session price"]').setValue('Synthetic QA');
 expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({amountCents:100,reason:'Synthetic QA'});w.unmount();
});
it('keeps the override out of a tutor-only account',()=>{const w=mount(Price,{props:{...props,canSet:false}});expect(w.find('fieldset').exists()).toBe(false);expect(w.text()).toContain('authorized pricing administrator');w.unmount();});
it('resets the override when switching students or packages',async()=>{
 const w=mount(Price,{props});await w.findAll('input[type=radio]')[1].setValue();await w.get('[aria-label="Custom session price in dollars"]').setValue('1');
 await w.setProps({contextKey:'453:1496:320:2547'});expect(w.emitted('update:modelValue').at(-1)[0]).toBeNull();await w.setProps({packageId:8});expect(w.find('fieldset').exists()).toBe(false);expect(w.text()).toContain('selected package credit');w.unmount();
});
it.each(['-1','1.111','1e2','word',''])('does not turn malformed dollars into a price: %s',async value=>{
 const w=mount(Price,{props});await w.findAll('input[type=radio]')[1].setValue();await w.get('[aria-label="Custom session price in dollars"]').setValue(value);expect(w.emitted('update:modelValue').at(-1)[0].amountCents).toBeNull();w.unmount();
});
