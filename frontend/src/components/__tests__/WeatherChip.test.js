import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
const m=vi.hoisted(()=>({refresh:vi.fn(),weather:null,refreshing:null}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:901}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'example'}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../composables/useScheduleWeather.js',()=>({useWeatherForecast:()=>({weather:m.weather,refreshing:m.refreshing,refresh:m.refresh})}));
import WeatherChip from '../WeatherChip.vue';
let wrapper;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-14T20:00:00Z'));m.refresh.mockReset();m.refreshing=ref(false);
 m.weather=ref({status:'ok',timeZone:'America/Denver',location:{source:'primary_office',label:'Example office · Colorado Springs, CO'},current:{temperatureF:37},snow:{snowLikelyNext72h:false},forecastDays:[{date:'2026-11-13',tempMaxF:40},{date:'2026-11-14',tempMaxF:43,snowfallInches:0}]});
});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';vi.useRealTimers();});
it('renders the hover forecast outside a scrolling navigation wrapper and opens the full local forecast',async()=>{
 const nav=document.createElement('div');nav.style.overflow='hidden';document.body.append(nav);
 wrapper=mount(WeatherChip,{attachTo:nav});await wrapper.get('.weather-chip-pill').trigger('focus');await vi.advanceTimersByTimeAsync(170);await flushPromises();
 const card=document.querySelector('.weather-hover-card');expect(card).not.toBeNull();expect(nav.contains(card)).toBe(false);expect(card.textContent).toContain('Example office');
 expect(card.textContent).toContain('43°');expect(card.textContent).not.toContain('40°');
 await wrapper.get('.weather-chip-pill').trigger('click');await flushPromises();expect(document.querySelector('[role=dialog]').textContent).toContain('Local weather');
 expect(document.querySelector('.weather-modal-sub').textContent).toBe('Current temperature');
});
it('offers a manual retry when weather is unavailable and marks retained weather as saved',async()=>{
 m.weather.value={status:'forecast_failed'};wrapper=mount(WeatherChip,{attachTo:document.body});await wrapper.get('.weather-chip-link').trigger('click');
 const retry=[...document.querySelectorAll('button')].find(node=>node.textContent==='Refresh weather');retry.click();expect(m.refresh).toHaveBeenCalledWith({force:true});
 m.weather.value={status:'ok',stale:true,fetchedAt:'2026-11-14T19:00:00Z',location:{label:'Example area'},current:{temperatureF:37}};await flushPromises();expect(wrapper.text()).toContain('Weather · saved');expect(document.querySelector('.weather-stale').textContent).toContain('last available forecast');
});
