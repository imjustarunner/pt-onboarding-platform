import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { normalizeWeatherForecast, snowfallInches } from '../weatherForecast.js';
import { resolveWeatherLocation } from '../weatherLocation.service.js';
it('converts reported snowfall units once and preserves missing data', () => {
 expect(snowfallInches(2.54,'cm')).toBe(1); expect(snowfallInches(2.4,'inch')).toBe(2.4);
 expect(snowfallInches(null,'cm')).toBeNull(); expect(snowfallInches(0,'cm')).toBe(0); expect(snowfallInches(1,'unknown')).toBeNull();
});
it('joins daily values by their forecast date, with location-day snow summaries and no invented zeros', () => {
 const result = normalizeWeatherForecast({timezone:'America/Denver',daily_units:{snowfall_sum:'inch'},
  daily:{time:['2026-11-13','2026-11-14','2026-11-15'],temperature_2m_max:[50,35,null],temperature_2m_min:[30,22,null],snowfall_sum:[8,2.4,null],weather_code:[75,73,null],precipitation_probability_max:[90,80,null]}},16,new Date('2026-11-14T14:00:00Z'));
 expect(result.forecastDays[1]).toMatchObject({date:'2026-11-14',tempMaxF:35,snowfallInches:2.4,weatherCode:73,precipitationProbability:80});
 expect(result.forecastDays[2]).toMatchObject({tempMaxF:null,tempMinF:null,snowfallInches:null,weatherCode:null});
 expect(result.snow).toMatchObject({nextSnowDate:'2026-11-14',maxSnowInchesNext72h:2.4});
});
it('prefers the signed-in user’s usable home area without looking up an office', async () => {
 const home={home_city:'Colorado Springs',home_state:'CO',home_street_address:'Private street'};const db={execute:vi.fn()};
 expect(await resolveWeatherLocation(501,home,{officeFallback:true,db})).toMatchObject({home,source:'home',label:'Colorado Springs, CO'}); expect(db.execute).not.toHaveBeenCalled();
});
it('keeps all six past days and sixteen forecast days without truncating the end of the forecast',()=>{
 const dates=Array.from({length:22},(_,index)=>new Date(Date.UTC(2026,10,8+index)).toISOString().slice(0,10));
 const result=normalizeWeatherForecast({daily:{time:dates}},22,new Date('2026-11-14T20:00:00Z'));
 expect(result.forecastDays).toHaveLength(22);expect(result.forecastDays[0].date).toBe('2026-11-08');expect(result.forecastDays.at(-1).date).toBe('2026-11-29');
});
it('uses only the user’s assigned primary office when their home area is missing',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{name:'Windchime',city:'Colorado Springs',state:'CO',postal_code:'80919',is_primary:1},{name:'Other office',is_primary:0}]])};
 expect(await resolveWeatherLocation(501,{}, {officeFallback:true,db})).toMatchObject({source:'primary_office',label:'Windchime · Colorado Springs, CO',home:{home_city:'Colorado Springs'}});
 expect(db.execute.mock.calls[0][1]).toEqual([501]);expect(db.execute.mock.calls[0][0]).toContain('uol.user_id=?');
});
it('does not guess an office when multiple assignments have no unique primary',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{name:'North',is_primary:0},{name:'South',is_primary:0}]])};
 expect(await resolveWeatherLocation(501,{}, {officeFallback:true,db})).toMatchObject({source:'home',home:{}});
});
