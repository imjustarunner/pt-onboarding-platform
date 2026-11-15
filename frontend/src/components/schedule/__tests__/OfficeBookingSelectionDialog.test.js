import {afterEach,expect,it} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Dialog from '../OfficeBookingSelectionDialog.vue';
let wrapper;
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';});
const create=()=>{wrapper=mount(Dialog,{props:{selectedRange:'11 AM–12 PM',blockRange:'8 AM–2 PM',hourCount:6,officeLabel:'Example office · Office #10',dateLabel:'Sunday, Nov 15'},attachTo:document.body});return wrapper;};
it('offers the selected hour and whole block as distinct in-app actions',async()=>{
 create();await flushPromises();const buttons=[...document.querySelectorAll('.choice')];expect(buttons[0].textContent).toContain('11 AM–12 PM');expect(buttons[1].textContent).toContain('8 AM–2 PM');
 buttons[0].click();expect(wrapper.emitted('choose')[0]).toEqual(['hour']);buttons[1].click();expect(wrapper.emitted('choose')[1]).toEqual(['block']);expect(wrapper.text()).not.toContain('app.itsco.health says');
});
it('allows going back without selecting either option, including Escape and backdrop dismissal',async()=>{
 create();document.querySelector('.back').click();expect(wrapper.emitted('close')).toHaveLength(1);
 document.querySelector('.office-selection-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(wrapper.emitted('close')).toHaveLength(2);
 document.querySelector('.office-selection-backdrop').click();expect(wrapper.emitted('close')).toHaveLength(3);expect(wrapper.emitted('choose')).toBeUndefined();
});
it('keeps keyboard focus in the dialog and returns it to the calendar trigger on close',async()=>{
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();create();await flushPromises();expect(document.activeElement).toBe(document.querySelector('.choice'));
 const back=document.querySelector('.back');back.focus();back.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(document.querySelector('.close'));
 wrapper.unmount();wrapper=null;expect(document.activeElement).toBe(trigger);
});
