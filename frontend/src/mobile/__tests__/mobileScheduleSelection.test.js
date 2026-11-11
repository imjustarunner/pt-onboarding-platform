import {describe,it,expect} from 'vitest';
import {mobileScheduleHandoffFields} from '../mobileCalendar.js';
import {readMobileScheduleSelection,availableMobileScheduleAction} from '../../utils/mobileScheduleSelection.js';
const selected={scheduleAction:'agency_meeting',scheduleDate:'2026-11-11',scheduleStart:'05:15',scheduleEnd:'06:45',scheduleTimeZone:'America/Denver',scheduleAgencyId:'2'};
describe('mobile to canonical schedule selection',()=>{
 it('preserves an early local range, exact calendar date and explicit timezone',()=>{expect(readMobileScheduleSelection(selected)).toEqual({action:'agency_meeting',agencyId:2,date:'2026-11-11',start:315,end:405,timeZone:'America/Denver'});expect(mobileScheduleHandoffFields({...selected,returnUrl:'https://invalid.example',notes:'excluded'})).toEqual(Object.fromEntries(Object.entries(selected).filter(([key])=>key!=='scheduleAgencyId')));});
 it.each([{scheduleDate:'2026-02-30'},{scheduleDate:'invalid'},{scheduleStart:'24:00'},{scheduleEnd:'04:00'},{scheduleEnd:'05:15'},{scheduleTimeZone:'invalid/zone'},{scheduleAgencyId:'2suffix'},{scheduleAction:'admin_assign'},{scheduleAction:['agency_meeting']}])('rejects malformed, overnight, unsupported and partial selections %j',change=>{expect(readMobileScheduleSelection({...selected,...change})).toBeNull();});
 it('uses the current canonical chooser to reject hidden and disabled actions',()=>{const context=readMobileScheduleSelection(selected);expect(availableMobileScheduleAction([{id:'agency_meeting',disabledReason:'Access removed'}],context)).toBeNull();expect(availableMobileScheduleAction([{id:'agency_meeting',visible:false}],context)).toBeNull();expect(availableMobileScheduleAction([{id:'agency_meeting',label:'Schedule Meeting'}],context)?.id).toBe('agency_meeting');});
});
