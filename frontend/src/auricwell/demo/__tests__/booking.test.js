import {it,expect} from 'vitest';
import {demoResponse,practice} from '../fixtures.js';
it('supplies scoped offices, physical service locations, rooms and clinical service defaults',()=>{
 const offices=demoResponse('/offices');expect(offices).toHaveLength(2);expect(offices.every(office=>office.agencyIds.includes(practice.id))).toBe(true);
 const metadata=demoResponse('/office-schedule/booking-metadata');
 for(const [code,duration] of [['90832',30],['90834',45],['90837',60]])expect(metadata.serviceCodes.find(service=>service.code===code).defaultDurationMinutes).toBe(duration);
 for(const office of offices){expect(metadata.serviceLocations.some(location=>location.billingOfficeLocationId===office.id && location.placeOfService==='11')).toBe(true);const rooms=demoResponse(`/office-schedule/locations/${office.id}/rooms`);expect(rooms).toHaveLength(2);expect(demoResponse('/office-schedule/available-rooms-for-slot',{params:{locationId:office.id,recurrence:'ONCE'}}).rooms).toEqual(rooms);}
 const suite=demoResponse(`/tenant-booking/agencies/${practice.id}/booking-options`).services;expect(suite.map(service=>service.defaultDurationMinutes)).toEqual(metadata.serviceCodes.map(service=>service.defaultDurationMinutes));
 expect(()=>demoResponse('/office-schedule/locations/1/rooms')).toThrow(/outside/);expect(()=>demoResponse('/office-schedule/available-rooms-for-slot',{params:{locationId:1}})).toThrow(/outside/);
 expect(()=>demoResponse('/office-schedule/booking-requests',{method:'post'})).toThrow(/nothing was saved/);
});
