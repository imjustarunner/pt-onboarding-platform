import {expect,it} from 'vitest';
import {createMemoryHistory,createRouter} from 'vue-router';
import {myScheduleDestination} from '../myScheduleDestination.js';
it.each(['','itsco'])('uses the dashboard calendar and preserves cancellation and event links for %s',async slug=>{
 const base=slug?`/${slug}`:'';
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/my-schedule',redirect:myScheduleDestination},{path:'/my-schedule',redirect:myScheduleDestination},{path:'/dashboard',component:{}},{path:'/:organizationSlug/dashboard',component:{}}]});
 await router.push(`${base}/my-schedule?cancelDay=2026-11-30&providerId=7&agencyId=2&weekStart=2026-11-30&eventId=41#calendar`);
 expect(router.currentRoute.value.path).toBe(`${base}/dashboard`);
 expect(router.currentRoute.value.query).toEqual({tab:'my_schedule',cancelDay:'2026-11-30',providerId:'7',agencyId:'2',weekStart:'2026-11-30',eventId:'41'});
 expect(router.currentRoute.value.hash).toBe('#calendar');
});
