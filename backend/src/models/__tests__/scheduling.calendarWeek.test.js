import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../services/meetingWindowConflict.service.js',()=>({withMeetingWindow:vi.fn()}));
vi.mock('../../services/appointmentScheduleSync.service.js',()=>({assertProviderEventCanMove:vi.fn(),syncAppointmentFromProviderEvent:vi.fn(),moveOfficeFromProviderEvent:vi.fn(),cancelAppointmentsFromCalendar:vi.fn()}));
import ProviderScheduleEvent from '../ProviderScheduleEvent.model.js';
import {scheduleWeekWindow} from '../../utils/scheduleWeekWindow.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);});
it.each(['America/Denver','Pacific/Auckland'])('keeps all-day date boundaries separate from the UTC query window in %s',async zone=>{
 const window=scheduleWeekWindow('2026-11-16',zone);
 await ProviderScheduleEvent.listForUserInWindow({providerId:7,agencyId:2,...window,startDate:'2026-11-16',endDate:'2026-11-23'});
 expect(m.execute.mock.calls[0][1].slice(-4)).toEqual(['2026-11-23','2026-11-16',window.windowEnd,window.windowStart]);
});
