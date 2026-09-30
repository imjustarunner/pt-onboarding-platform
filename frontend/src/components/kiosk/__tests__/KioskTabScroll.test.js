import {it,expect,vi,afterEach} from 'vitest';
import {mount} from '@vue/test-utils';
import {defineComponent,ref} from 'vue';
import {useKioskTabScroll} from '../../../composables/useKioskTabScroll.js';
let wrapper;afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(reduced=false){vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.stubGlobal('matchMedia',()=>({matches:reduced}));const Harness=defineComponent({setup(){const el=ref(null);useKioskTabScroll(el,()=>true);return {el};},template:'<nav ref="el"><button>Client check-in</button></nav>'});wrapper=mount(Harness);const el=wrapper.get('nav').element;Object.defineProperties(el,{scrollWidth:{value:400},clientWidth:{value:200}});return el;}
it('moves overflowing tabs slowly, reverses at the edge, and pauses for touch',async()=>{
 const el=setup();await vi.advanceTimersByTimeAsync(4000);expect(el.scrollLeft).toBeGreaterThan(0);expect(el.scrollLeft).toBeLessThan(30);
 await wrapper.get('nav').trigger('pointerdown');const stopped=el.scrollLeft;await vi.advanceTimersByTimeAsync(12000);expect(el.scrollLeft).toBe(stopped);await wrapper.get('nav').trigger('pointerup');await vi.advanceTimersByTimeAsync(9000);expect(el.scrollLeft).toBe(stopped);await vi.advanceTimersByTimeAsync(12000);expect(el.scrollLeft).toBeGreaterThan(stopped);await vi.advanceTimersByTimeAsync(8000);expect(el.scrollLeft).toBeLessThan(200);
});
it('respects reduced motion',async()=>{const el=setup(true);await vi.advanceTimersByTimeAsync(30000);expect(el.scrollLeft).toBe(0);});
