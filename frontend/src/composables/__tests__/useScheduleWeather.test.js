import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:m}));
import { useWeatherForecast } from '../useScheduleWeather.js';
let id=1000,wrappers=[];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-14T20:00:00Z'));m.get.mockReset();id++;});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];vi.useRealTimers();});
const start=identity=>{let state;const wrapper=mount(defineComponent({setup(){state=useWeatherForecast(identity);return()=>h('span',state.weather.value?.status);}}));wrappers.push(wrapper);return state;};
const forecast=()=>({status:'ok',fetchedAt:new Date().toISOString(),forecastDays:[{date:'2026-11-14',tempMaxF:42}]});
it('shares a single request and its updates between calendar and navigation',async()=>{
 let finish;m.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const a=start(()=>id),b=start(()=>id);expect(m.get).toHaveBeenCalledOnce();
 finish({data:forecast()});await flushPromises();expect(a.weather.value).toEqual(b.weather.value);expect(a.weather.value.status).toBe('ok');
 expect(m.get).toHaveBeenCalledWith('/weather/me',expect.objectContaining({params:{view:'schedule'}}));
});
it('recovers an initial failure automatically after one minute',async()=>{
 m.get.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({data:forecast()});const state=start(()=>id);await flushPromises();expect(state.weather.value.status).toBe('unavailable');
 await vi.advanceTimersByTimeAsync(60_000);expect(state.weather.value.status).toBe('ok');expect(m.get).toHaveBeenCalledTimes(2);
});
it('allows an immediate explicit retry and shares it with the calendar',async()=>{
 m.get.mockResolvedValueOnce({data:{status:'forecast_failed'}}).mockResolvedValue({data:forecast()});const a=start(()=>id),b=start(()=>id);await flushPromises();
 await a.refresh({force:true});expect(b.weather.value.status).toBe('ok');expect(m.get).toHaveBeenCalledTimes(2);
 expect(m.get).toHaveBeenLastCalledWith('/weather/me',expect.objectContaining({params:{view:'schedule',force:1}}));
});
it('keeps recent weather during a transient error, labels it saved, and refreshes both surfaces together',async()=>{
 m.get.mockResolvedValueOnce({data:forecast()}).mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({data:forecast()});const a=start(()=>id),b=start(()=>id);await flushPromises();
 await vi.advanceTimersByTimeAsync(600_000);expect(a.weather.value.stale).toBe(true);expect(b.weather.value.stale).toBe(true);
 await vi.advanceTimersByTimeAsync(60_000);expect(a.weather.value.stale).not.toBe(true);expect(m.get).toHaveBeenCalledTimes(3);
});
it('clears weather when the account changes, even when the old request finishes later',async()=>{
 const identity=ref(id);let finish;m.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({data:{status:'missing_home_address'}});
 const state=start(()=>identity.value);identity.value=id+5000;await flushPromises();finish({data:forecast()});await flushPromises();expect(state.weather.value.status).toBe('missing_home_address');
 identity.value=null;await flushPromises();expect(state.weather.value).toBeNull();
});
