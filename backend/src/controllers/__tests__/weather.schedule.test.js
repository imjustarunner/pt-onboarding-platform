import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),get:vi.fn(),geocode:vi.fn(),forecast:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('axios',()=>({default:{get:m.get}}));
vi.mock('../../services/googleGeocode.service.js',()=>({geocodeAddressWithGoogle:m.geocode}));
vi.mock('../../models/User.model.js',()=>({default:{findByEmail:vi.fn()}}));
vi.mock('../../services/weatherForecastCache.js',()=>({cachedWeatherForecast:m.forecast}));
import { getMyWeather } from '../weather.controller.js';
let id=100;
beforeEach(()=>{
 vi.clearAllMocks();id++;m.geocode.mockResolvedValue({latitude:38.8,longitude:-104.8});
 m.forecast.mockResolvedValue({fetchedAt:'2026-11-14T20:00:00Z',stale:false,data:{timezone:'America/Denver',daily_units:{snowfall_sum:'inch'},daily:{time:['2026-11-16'],temperature_2m_max:[35],snowfall_sum:[2.4],weather_code:[73]}}});
 m.execute.mockImplementation(async sql=>sql.includes('FROM users')?[[{}]]:sql.includes('FROM user_office_locations')?[[{name:'Main office',street_address:'123 Office Lane',city:'Colorado Springs',state:'CO',postal_code:'80919',is_primary:1}]]:[[]]);
});
const invoke=async(query={view:'schedule'})=>{const res={json:vi.fn(value=>value)};await getMyWeather({user:{id},query},res,vi.fn());return res.json.mock.calls[0][0];};
it('serves sixteen days through the existing weather API and names the primary office without storing it as a home address',async()=>{
 const result=await invoke();expect(result).toMatchObject({status:'ok',location:{source:'primary_office',label:'Main office · Colorado Springs, CO'},forecastDays:[expect.objectContaining({snowfallInches:2.4})]});
 expect(m.forecast).toHaveBeenCalledWith({latitude:38.8,longitude:-104.8});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE users'))).toBe(false);
 expect(JSON.stringify(result)).not.toContain('123 Office Lane');
});
it('keeps the existing home-only response when the navbar has no home address',async()=>{
 expect(await invoke({})).toEqual({status:'missing_home_address'});expect(m.get).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.includes('user_office_locations'))).toBe(false);
});
it('does not mix the schedule’s office fallback cache into the home-only navbar response',async()=>{
 expect((await invoke()).status).toBe('ok');expect((await invoke({})).status).toBe('missing_home_address');
});
it('uses a ZIP and the provider’s documented country filter if Google geocoding is unavailable',async()=>{
 m.geocode.mockRejectedValue(Object.assign(new Error('unavailable'),{code:'MAPS_KEY_MISSING'}));
 m.get.mockImplementation(async url=>({data:url.includes('geocoding-api')?{results:[{country_code:'US',latitude:38.8,longitude:-104.8}]}:{daily:{time:[]}}}));
 expect((await invoke()).status).toBe('ok');expect(m.geocode).toHaveBeenCalledOnce();
 expect(m.get).toHaveBeenCalledWith('https://geocoding-api.open-meteo.com/v1/search',expect.objectContaining({params:expect.objectContaining({name:'80919',countryCode:'US'})}));
});
it('falls back when geocoding returns no result and never clears usable saved coordinates on refresh',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('FROM users')?[[{home_city:'Colorado Springs',home_state:'CO',home_postal_code:'80919',home_lat:38.8,home_lng:-104.8,home_geocoded_at:new Date()}]]:[[]]);
 m.geocode.mockResolvedValue(null);m.get.mockRejectedValue(new Error('temporary geocoder outage'));
 expect((await invoke({view:'schedule',force:'1'})).status).toBe('ok');
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('home_lat = NULL'))).toBe(false);
 expect(m.forecast).toHaveBeenCalledWith({latitude:38.8,longitude:-104.8});
});
