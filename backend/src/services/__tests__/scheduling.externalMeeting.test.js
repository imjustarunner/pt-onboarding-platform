import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {validateExternalMeeting,validExternalMeetingUrl} from '../appointmentExternalMeeting.service.js';
import {guardianAppointmentJoin} from '../guardianVirtualJoin.js';
import Appointment from '../../models/Appointment.model.js';
let db;
beforeEach(()=>{vi.restoreAllMocks();db={execute:vi.fn(async()=>[[{slug:'nlu'}]])};});
it('allows NLU to mark a virtual appointment external before its link is known',async()=>{
 await expect(validateExternalMeeting({agencyId:6,videoRoomMode:'external',modality:'TELEHEALTH'},db)).resolves.toBeNull();
 expect(db.execute).toHaveBeenCalledWith(expect.any(String),[6]);
 await expect(validateExternalMeeting({agencyId:6,videoRoomMode:'external',modality:'TELEHEALTH',externalMeetingUrl:'https://video.example.test/session'},db)).resolves.toBe('https://video.example.test/session');
});
it('keeps the feature scoped to NLU and rejects unsafe URL schemes',async()=>{
 db.execute.mockResolvedValue([[{slug:'itsco'}]]);await expect(validateExternalMeeting({agencyId:2,videoRoomMode:'external',modality:'TELEHEALTH'},db)).rejects.toHaveProperty('status',403);
 for(const url of ['javascript:alert(1)','http://video.example.test','https://user:password@example.test'])expect(()=>validExternalMeetingUrl(url)).toThrow();
});
it('returns the saved external destination only for an active appointment and authorized portal relationship',async()=>{
 const row={videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session',modality:'TELEHEALTH',status:'scheduled'};
 expect(await guardianAppointmentJoin(row,{},db)).toBe(row.externalMeetingUrl);
 expect(await guardianAppointmentJoin(row,{portal_access:{limited:true}},db)).toBeNull();
 expect(await guardianAppointmentJoin({...row,status:'canceled_by_provider'},{},db)).toBeNull();
});
it('persists the external mode and URL and fails visibly if its migration is missing',async()=>{
 const source={agencyId:6,providerUserId:20,startAt:'2030-01-01 17:00:00',endAt:'2030-01-01 18:00:00',status:'scheduled',videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session'};
 db.execute.mockResolvedValue([{insertId:12}]);vi.spyOn(Appointment,'findById').mockResolvedValue({id:12,...source});
 await Appointment.createInAvailableWindow(source,{executor:db});
 expect(db.execute).toHaveBeenCalledTimes(1);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('external_meeting_url'),expect.arrayContaining([source.externalMeetingUrl]));
 db.execute.mockClear().mockRejectedValueOnce(Object.assign(Error('Unknown column'),{code:'ER_BAD_FIELD_ERROR'}));
 await expect(Appointment.createInAvailableWindow(source,{executor:db})).rejects.toHaveProperty('code','ER_BAD_FIELD_ERROR');
 expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO appointments'))).toHaveLength(1);
});
it('saves and clears external links in the same appointment update',async()=>{
 const existing={id:12,agencyId:6,providerUserId:20,startAt:'2030-01-01 17:00:00',endAt:'2030-01-01 18:00:00',status:'scheduled',videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session'};
 vi.spyOn(Appointment,'findById').mockResolvedValue(existing);db.execute.mockResolvedValue([{affectedRows:1}]);
 await Appointment.updateInAvailableWindow(12,{externalMeetingUrl:'https://video.example.test/new'},null,{executor:db});
 expect(db.execute).toHaveBeenCalledTimes(1);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('external_meeting_url = ?'),expect.arrayContaining(['https://video.example.test/new']));
 db.execute.mockClear();
 await Appointment.updateInAvailableWindow(12,{videoRoomMode:'unique_session'},null,{executor:db});
 const [sql,params]=db.execute.mock.calls[0];
 expect(sql).toContain('external_meeting_url = ?');expect(params[27]).toBeNull();
});
