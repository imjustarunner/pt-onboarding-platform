import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),execute:vi.fn(),signal:vi.fn(),member:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/scheduledTraining.service.js',()=>({trainingAccess:m.access,trainingError:(status,message)=>Object.assign(new Error(message),{status}),createScheduledTraining:vi.fn(),trainingRoster:vi.fn()}));
vi.mock('../../services/storage.service.js',()=>({default:{}}));
vi.mock('../../services/vonageVideo.service.js',()=>({default:{sendSignal:m.signal}}));
vi.mock('../../services/meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member}));
import {trainingHand,updateTraining,getTraining} from '../scheduledTraining.controller.js';
const response=()=>({json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({event:{id:7,status:'ACTIVE'},proctor:false});m.execute.mockResolvedValue([{affectedRows:1}]);});
it('allows attendees to raise their own hand, but never approve themselves or impersonate another attendee',async()=>{
 const res=response(),next=vi.fn();await trainingHand({params:{eventId:7},user:{id:4},body:{action:'raise'}},res,next);expect(res.json).toHaveBeenCalledWith({ok:true});
 for(const body of [{action:'approve'},{action:'deny',userId:5},{action:'raise',userId:5}]){m.execute.mockClear();await trainingHand({params:{eventId:7},user:{id:4},body},res,next);expect(next).toHaveBeenLastCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();}
});
it('a proctor can approve a current hand, but cannot revive a withdrawn or already resolved hand',async()=>{
 m.access.mockResolvedValue({event:{id:7,status:'ACTIVE'},proctor:true});const res=response(),next=vi.fn();await trainingHand({params:{eventId:7},user:{id:1},body:{action:'approve',userId:4}},res,next);expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("AND status='raised'"),['approved',1,7,4]);m.execute.mockResolvedValue([{affectedRows:0}]);await trainingHand({params:{eventId:7},user:{id:1},body:{action:'approve',userId:4}},res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
});
it('mute all revokes previous individual approvals so reconnecting attendees remain muted',async()=>{
 m.access.mockResolvedValue({event:{id:7,status:'ACTIVE'},proctor:true});await updateTraining({params:{eventId:7},user:{id:1},body:{muteAll:true}},response(),vi.fn());expect(m.access).toHaveBeenCalledWith(7,{id:1},{edit:true});expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("AND status='approved'"),[1,7]);
});
it('does not allow camera or microphone changes when the actor is not a proctor',async()=>{m.access.mockRejectedValue(Object.assign(new Error('Proctors only'),{status:403}));const next=vi.fn();await updateTraining({params:{eventId:7},user:{id:4},body:{videoAllowed:true,muteAll:false}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();});

it.each([['provider',false],['support',true],['admin',true]])('filters declined training RSVP data server-side for %s',async(role,canSeeDeclined)=>{
 m.access.mockResolvedValue({event:{id:7,status:'ACTIVE',provider_id:2,agency_visible:1},proctor:false});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT u.id,')?[[{id:4,name:'Accepted',rsvp:'accepted'},{id:5,name:'Declined',rsvp:'declined',rsvp_decline_reason:'Private reason'}]]:[[]]);
 const res=response(),next=vi.fn();await getTraining({params:{eventId:7},user:{id:4,role}},res,next);
 expect(next).not.toHaveBeenCalled();const result=res.json.mock.calls[0][0];
 expect(result.canRegister).toBe(true);expect(result.canSeeDeclined).toBe(canSeeDeclined);
 expect(result.participants.map(p=>p.id)).toEqual(canSeeDeclined?[4,5]:[4]);
 if(!canSeeDeclined)expect(JSON.stringify(result)).not.toContain('Private reason');
});

it('lets a proctor permit an invited attendee to speak without requiring a raised hand',async()=>{
 m.access.mockResolvedValue({event:{id:7,agency_id:2,status:'ACTIVE'},proctor:true});m.member.mockResolvedValue(true);m.execute.mockImplementation(async sql=>sql.startsWith('SELECT user_id')?[[{user_id:4}]]:[{affectedRows:1}]);
 const next=vi.fn();await trainingHand({params:{eventId:7},user:{id:1},body:{action:'allow',userId:4}},response(),next);
 expect(next).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'),[7,4,'approved',1]);
 m.member.mockResolvedValue(false);await trainingHand({params:{eventId:7},user:{id:1},body:{action:'allow',userId:4}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});
