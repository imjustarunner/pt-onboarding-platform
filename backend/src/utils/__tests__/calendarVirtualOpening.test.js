import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../utils/invalidateAvailabilityReminders.js',()=>({invalidateAvailabilityReminders:vi.fn()}));
vi.mock('../../services/availabilityPublicationStatus.service.js',()=>({openWaitlistedPublication:vi.fn()}));
import Hours from '../../models/ProviderVirtualWorkingHours.model.js';
import {calendarVirtualOpening} from '../calendarVirtualOpening.js';
import {savedOpeningServiceType} from '../../../../frontend/src/utils/virtualAvailabilityGrid.js';
it.each([[true,true],[false,true],[true,false]])('keeps tutoring classified across normalization, calendar projection and grid rendering (%s/%s)',(availableForIntake,availableForSession)=>{
 const [saved]=Hours.normalizeRows([{dayOfWeek:'Sunday',startTime:'19:15',endTime:'21:15',frequency:'ONCE',startDate:'2026-11-22',endDate:'2026-11-22',purpose:'INTAKE',serviceType:'tutoring',availableForIntake,availableForSession}]);
 const wire=JSON.parse(JSON.stringify(calendarVirtualOpening({...saved,id:255,agencyId:453})));
 expect(savedOpeningServiceType(wire)).toBe('tutoring');expect(wire).toMatchObject({id:255,agencyId:453,serviceType:'tutoring',availableForIntake,availableForSession,startDate:'2026-11-22',endDate:'2026-11-22'});
});
it('does not invent a service for a legacy blank or expose a disabled publication',()=>{
 expect(calendarVirtualOpening({id:1,agencyId:453,sessionType:'BOTH'}).serviceType).toBeNull();
 expect(calendarVirtualOpening({id:1,agencyId:453,sessionType:'BOTH',availableForIntake:false,availableForSession:false})).toBeNull();
});
