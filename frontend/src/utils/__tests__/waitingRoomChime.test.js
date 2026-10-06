import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createWaitingRoomChime } from '../waitingRoomChime';
let context, chime;
beforeEach(()=>{
 const ramp=()=>({setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
 context={state:'running',currentTime:10,destination:{},resume:vi.fn(async()=>{}),close:vi.fn(async()=>{}),
   createOscillator:vi.fn(()=>({frequency:ramp(),connect:vi.fn(),start:vi.fn(),stop:vi.fn(),disconnect:vi.fn()})),
   createGain:vi.fn(()=>({gain:ramp(),connect:vi.fn(),disconnect:vi.fn()}))};
 vi.stubGlobal('AudioContext',class{constructor(){return context;}});
});
afterEach(()=>{chime?.dispose();vi.unstubAllGlobals();});
it('plays one local tone, coalesces simultaneous arrivals, and releases audio nodes',()=>{
 chime=createWaitingRoomChime();chime.play();chime.play();expect(context.createOscillator).toHaveBeenCalledOnce();
 const oscillator=context.createOscillator.mock.results[0].value,gain=context.createGain.mock.results[0].value;
 expect(gain.connect).toHaveBeenCalledWith(context.destination);oscillator.onended();expect(oscillator.disconnect).toHaveBeenCalled();expect(gain.disconnect).toHaveBeenCalled();
 context.currentTime+=2;chime.play();expect(context.createOscillator).toHaveBeenCalledTimes(2);
});
it('queues a blocked ding until the browser grants playback and reports the blocked state',async()=>{
 context.state='suspended';const ready=vi.fn();chime=createWaitingRoomChime(ready);chime.play();
 expect(ready).toHaveBeenLastCalledWith(false);expect(context.createOscillator).not.toHaveBeenCalled();
 context.resume.mockImplementation(async()=>{context.state='running';});chime.enable();await Promise.resolve();
 expect(context.createOscillator).toHaveBeenCalledOnce();expect(ready).toHaveBeenLastCalledWith(true);
});
it('does not play a queued alert after everyone was admitted or the component was destroyed',async()=>{
 context.state='suspended';chime=createWaitingRoomChime();chime.play();chime.cancelPending();
 context.state='running';context.onstatechange();expect(context.createOscillator).not.toHaveBeenCalled();
 chime.dispose();chime.play();expect(context.createOscillator).not.toHaveBeenCalled();expect(context.close).toHaveBeenCalled();
});
