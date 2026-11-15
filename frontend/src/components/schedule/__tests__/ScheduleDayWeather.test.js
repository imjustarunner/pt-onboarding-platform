import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Weather from '../ScheduleDayWeather.vue';
const weather={status:'ok',location:{label:'Windchime · Colorado Springs, CO',source:'primary_office'},forecastDays:[{date:'2026-11-16',tempMaxF:35,tempMinF:22,snowfallInches:2.4,weatherCode:73,precipitationProbability:80}]};
it('shows the high and inches, and describes the forecast and office on hover',()=>{
 const wrapper=mount(Weather,{props:{date:'2026-11-16',weather}});
 expect(wrapper.text()).toContain('35°');expect(wrapper.text()).toContain('Snow 2.4″');
 expect(wrapper.attributes('title')).toContain('Office forecast: Windchime');expect(wrapper.attributes('title')).toContain('High 35°F');expect(wrapper.attributes('title')).toContain('2.4 inches');wrapper.unmount();
});
it('does not reuse another date’s forecast or present missing snowfall as no snow',async()=>{
 const wrapper=mount(Weather,{props:{date:'2026-12-01',weather}});expect(wrapper.text()).toBe('Outside forecast range');expect(wrapper.text()).not.toContain('35');
 await wrapper.setProps({date:'2026-11-16',weather:{...weather,forecastDays:[{...weather.forecastDays[0],snowfallInches:null}]}});expect(wrapper.text()).toContain('Snow total unavailable');wrapper.unmount();
});
