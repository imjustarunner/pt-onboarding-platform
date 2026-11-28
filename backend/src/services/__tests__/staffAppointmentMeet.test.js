import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async id=>({id,email:'qa.tutor@example.com'}))}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../scheduleCalendarPolicy.service.js',()=>({usesGoogleSchedule:vi.fn(async()=>true)}));
vi.mock('../auricwell/sessionTransports.js',()=>({createGoogleSession:vi.fn(),retireGoogleSession:vi.fn(async()=>{}),allowGoogleSessionGuests:vi.fn(),readGoogleSession:vi.fn()}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import {usesGoogleSchedule} from '../scheduleCalendarPolicy.service.js';
import {createGoogleSession,retireGoogleSession} from '../auricwell/sessionTransports.js';
import {prepareStaffAppointmentMeet,staffAppointmentMeetDetails} from '../staffAppointmentMeet.service.js';
const appointment={id:901,agencyId:453,providerUserId:1496,businessType:'tutoring',status:'scheduled',videoRoomMode:'google_meet',endAt:'2099-01-01 18:00:00'};
let db,links;
beforeEach(()=>{vi.clearAllMocks();links=new Map();usesGoogleSchedule.mockResolvedValue(true);Appointment.findById.mockImplementation(async id=>({...appointment,id}));
 createGoogleSession.mockResolvedValue({url:'https://meet.google.com/abc-defg-hij'});
 db={release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT private_meet_url'))return [[{private_meet_url:links.get(args[0])}]];
  if(sql.startsWith('UPDATE appointments')){links.set(args[1],args[0]);return [{affectedRows:1}];}
  if(sql.includes('FROM agencies'))return [[{id:453,slug:'nlu-qa-demo'}]];
  return [[]];
 })};pool.getConnection.mockResolvedValue(db);
});
it('creates the tutoring appointment’s unique Meet once and reuses it on retry without making a native room',async()=>{
 expect(await prepareStaffAppointmentMeet(appointment)).toBe('https://meet.google.com/abc-defg-hij');
 expect(await prepareStaffAppointmentMeet(appointment)).toBe('https://meet.google.com/abc-defg-hij');
 expect(createGoogleSession).toHaveBeenCalledTimes(1);
 expect(createGoogleSession).toHaveBeenCalledWith('qa.tutor@example.com',{privateAccess:true,guestAccess:true});
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('AND provider_user_id = ?'),[expect.any(String),901,453,1496]);
 expect(db.release).toHaveBeenCalledTimes(2);
});
it('keeps separate recurring appointments on separate Meet rooms',async()=>{
 createGoogleSession.mockResolvedValueOnce({url:'https://meet.google.com/abc-defg-hij'}).mockResolvedValueOnce({url:'https://meet.google.com/klm-nopq-rst'});
 expect(await prepareStaffAppointmentMeet(appointment)).not.toBe(await prepareStaffAppointmentMeet({...appointment,id:902}));
 expect(links.size).toBe(2);
});
it('reports missing workspace setup instead of fabricating a Meet link or substituting platform video',async()=>{
 usesGoogleSchedule.mockResolvedValue(false);
 await expect(prepareStaffAppointmentMeet(appointment)).rejects.toMatchObject({status:409,message:expect.stringContaining('workspace')});
 expect(createGoogleSession).not.toHaveBeenCalled();expect(links.size).toBe(0);
});
it('rejects a changed provider or canceled appointment before creating a room',async()=>{
 for(const change of [{providerUserId:999},{status:'canceled_by_client'},{videoRoomMode:'unique_session'}]){
  Appointment.findById.mockResolvedValue({...appointment,...change});
  await expect(prepareStaffAppointmentMeet(appointment)).rejects.toHaveProperty('status',409);
 }
 expect(createGoogleSession).not.toHaveBeenCalled();
});
it('retires only its newly created room if the saved appointment changes concurrently',async()=>{
 const execute=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.startsWith('UPDATE appointments')?[{affectedRows:0}]:execute(sql,args));
 await expect(prepareStaffAppointmentMeet(appointment)).rejects.toHaveProperty('status',409);
 expect(retireGoogleSession).toHaveBeenCalledWith({url:'https://meet.google.com/abc-defg-hij'});
});
it('returns readiness to the booker and the private host URL only to the appointment’s assigned tutor',async()=>{
 links.set(901,'https://meet.google.com/abc-defg-hij');
 expect(await staffAppointmentMeetDetails(appointment,1807,db)).toEqual({googleMeetReady:true});
 expect(await staffAppointmentMeetDetails(appointment,1496,db)).toEqual({googleMeetReady:true,googleMeetUrl:'https://meet.google.com/abc-defg-hij'});
 links.clear();expect(await staffAppointmentMeetDetails(appointment,1807,db)).toEqual({googleMeetReady:false});
 expect(createGoogleSession).not.toHaveBeenCalled();
});
