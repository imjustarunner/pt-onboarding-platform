import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import {nextTick} from 'vue';
import Spotlight from '../PtcoProductSpotlight.vue';

let wrapper;
const media=matches=>({matches,addEventListener:vi.fn(),removeEventListener:vi.fn()});
const render=()=>mount(Spotlight,{global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'}}}});
const advance=async()=>{vi.advanceTimersByTime(7000);await nextTick();};
const showing=()=>wrapper.find('.is-active .spotlight-copy h2').text();
beforeEach(()=>{
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia',vi.fn(()=>media(false)));
  vi.stubGlobal('IntersectionObserver',undefined);
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('homepage product spotlight',()=>{
  it('starts with HQ, rotates through all seven products, and can pause and resume',async()=>{
    wrapper=render();
    expect(showing()).toBe('Plot Twist HQ');
    expect(wrapper.find('.is-active .spotlight-action .ptco-button').attributes('href')).toBe('/p/ptco/hq');
    const seen=[showing()];
    for(let i=0;i<6;i++){await advance();seen.push(showing());}
    expect(new Set(seen).size).toBe(7);
    await advance();expect(showing()).toBe('Plot Twist HQ');
    await wrapper.find('[aria-label="Pause product rotation"]').trigger('click');
    await advance();expect(showing()).toBe('Plot Twist HQ');
    await wrapper.find('[aria-label="Play product rotation"]').trigger('click');
    await advance();expect(showing()).toBe('Plotline');
    expect(wrapper.find('.is-active .spotlight-action .ptco-button').attributes('href')).toBe('https://plottwistco.com/plottline');
    wrapper.unmount();expect(vi.getTimerCount()).toBe(0);wrapper=null;
  });
  it('pauses for hover and keyboard interaction and supports direct selection and wrapping',async()=>{
    wrapper=render();
    await wrapper.trigger('mouseenter');await advance();expect(showing()).toBe('Plot Twist HQ');
    await wrapper.trigger('mouseleave');await advance();expect(showing()).toBe('Plotline');
    wrapper.find('.is-active .spotlight-action a').element.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    await advance();expect(showing()).toBe('Plotline');
    await wrapper.find('[aria-label="Show Plot Twist HQ"]').trigger('click');
    await wrapper.find('[aria-label="Previous product"]').trigger('click');
    expect(showing()).toBe('Summit Stats Team Challenge');
    await wrapper.find('[aria-label="Next product"]').trigger('click');expect(showing()).toBe('Plot Twist HQ');
    await wrapper.find('[aria-label="Show AuricWell"]').trigger('click');
    await advance();expect(showing()).toBe('AuricWell');
    expect(wrapper.find('[aria-pressed="true"]').attributes('aria-label')).toBe('Show AuricWell');
  });
  it('starts paused for reduced motion and does not rotate in a hidden tab',async()=>{
    vi.stubGlobal('matchMedia',vi.fn(()=>media(true)));
    wrapper=render();await advance();expect(showing()).toBe('Plot Twist HQ');
    expect(wrapper.find('[aria-label="Play product rotation"]').exists()).toBe(true);
    await wrapper.find('[aria-label="Play product rotation"]').trigger('click');
    vi.spyOn(document,'hidden','get').mockReturnValue(true);
    await advance();expect(showing()).toBe('Plot Twist HQ');
  });
});
