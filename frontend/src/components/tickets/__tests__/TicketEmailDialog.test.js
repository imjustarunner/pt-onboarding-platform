import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Dialog from '../TicketEmailDialog.vue';
let wrapper, launcher;
beforeEach(()=>{
 launcher=document.createElement('button');document.body.append(launcher);launcher.focus();
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:vi.fn(function(){this.open=true;})});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:vi.fn()});
});
afterEach(()=>{wrapper?.unmount();launcher.remove();vi.restoreAllMocks();});
it('opens a centered native dialog with an explicit close button, Escape, and focus restoration',async()=>{
 wrapper=mount(Dialog,{props:{title:'Email preview'},slots:{default:'Saved signature preview'},attachTo:document.body});
 const dialog=document.querySelector('dialog');expect(dialog.open).toBe(true);expect(dialog.textContent).toContain('Saved signature preview');
 const close=dialog.querySelector('button');expect(close.textContent).toContain('Close preview');close.click();expect(wrapper.emitted('close')).toHaveLength(1);
 dialog.dispatchEvent(new Event('cancel',{cancelable:true}));expect(wrapper.emitted('close')).toHaveLength(2);
 wrapper.unmount();wrapper=null;expect(document.activeElement).toBe(launcher);
});
