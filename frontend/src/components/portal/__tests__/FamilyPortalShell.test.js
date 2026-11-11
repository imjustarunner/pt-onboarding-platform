import {afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Shell from '../FamilyPortalShell.vue';
let w;const originalWidth=window.innerWidth;
afterEach(()=>{w?.unmount();document.body.innerHTML='';Object.defineProperty(window,'innerWidth',{value:originalWidth,configurable:true});vi.restoreAllMocks();});
it('keeps agency/profile context outside the sticky brand bar',()=>{w=mount(Shell,{props:{brandName:'AuricWell'},slots:{context:'<div>Agency and profile controls</div>'}});expect(w.get('.portal-context').text()).toContain('Agency and profile controls');expect(w.get('.portal-sticky-header').text()).not.toContain('Agency and profile controls');});
it('opens the phone menu at document level, traps focus, and restores scrolling on close',async()=>{
 Object.defineProperty(window,'innerWidth',{value:390,configurable:true});document.body.style.overflow='auto';
 w=mount(Shell,{attachTo:document.body,props:{brandName:'AuricWell',navigation:[{key:'family',label:'My family'},{key:'messages',label:'Messages'}]}});
 await w.get('.portal-menu').trigger('click');await flushPromises();const dialog=document.querySelector('[role=dialog]');expect(dialog.parentElement).toBe(document.body);expect(dialog.getAttribute('aria-modal')).toBe('true');expect(document.body.style.overflow).toBe('hidden');expect(document.activeElement.textContent).toContain('Close menu');
 const buttons=dialog.querySelectorAll('button');buttons[buttons.length-1].focus();buttons[buttons.length-1].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(buttons[0]);dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(w.get('.portal-menu').element);
});
