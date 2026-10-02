import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),membership:vi.fn(),plan:vi.fn(),video:{isVideoConfigured:vi.fn(),generateToken:vi.fn(),createSession:vi.fn(),endLiveSession:vi.fn()},room:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:mocks.membership}));
vi.mock('../meetingAccessPlan.service.js',()=>({getMeetingPlan:mocks.plan}));
vi.mock('../../models/ProviderMyRoom.model.js',()=>({default:{findBySlug:mocks.room}}));
vi.mock('../vonageVideo.service.js',()=>({default:mocks.video}));
vi.mock('../video.service.js',()=>({resolveVideoProjectId:()=> 'project'}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(x=>({ciphertextB64:'encrypted',size:x.length})),decryptChatText:vi.fn(()=> 'data:image/jpeg;base64,private')}));
import {snapshotDataUrl,joinOffice,officeGuestStatus,officeGuestVideo,admitOfficeGuest,officeHostVideo,endOffice} from '../privateVirtualOffice.service.js';
const room={id:1,userId:5,agencyId:2,isActive:true,displayName:'Provider'};
let db;
beforeEach(()=>{vi.clearAllMocks();mocks.membership.mockResolvedValue(true);mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:false});mocks.video.isVideoConfigured.mockReturnValue(true);mocks.video.generateToken.mockReturnValue('video-token');mocks.video.createSession.mockResolvedValue('new-session');mocks.video.endLiveSession.mockResolvedValue({ok:true});db={execute:mocks.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(db);});
function handler({guest={id:8,status:'waiting',generation:2,photo_envelope:'photo',display_name:'Guest'},count=0,session={video_session_id:'live',generation:2,host_seen_at:new Date()}}={}){mocks.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT role'))return [[{role:'provider'}]];
 if(sql.includes('SELECT * FROM private_virtual_office_sessions'))return [[session]];
 if(sql.includes('COUNT(*)'))return [[{total:count}]];
 if(sql.includes('SELECT * FROM private_virtual_office_visits'))return [[guest]];
 return [{insertId:8,affectedRows:1}];
});}
describe('private office admission',()=>{
 it('rejects arbitrary URLs, forged MIME and oversized photos',()=>{for(const photo of ['https://example.com/photo.jpg','data:image/jpeg;base64,aGVsbG8=','data:image/png;base64,'+'A'.repeat(4*1024*1024)])expect(()=>snapshotDataUrl(photo)).toThrow();});
 it('requires both photo acknowledgement and current premium entitlement',async()=>{handler();await expect(joinOffice(room,{displayName:'Pat',photoRequiredAck:false})).rejects.toMatchObject({status:400});mocks.plan.mockResolvedValue({privateOffice:false});await expect(joinOffice(room,{})).rejects.toMatchObject({status:403});expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO private_virtual_office_visits'))).toBe(false);});
 it('creates an encrypted waiting visit without client or staff identity from caller input',async()=>{handler();const bytes=Buffer.alloc(120);bytes[0]=255;bytes[1]=216;bytes[2]=255;const visit=await joinOffice(room,{displayName:'Pat',photoRequiredAck:true,photoDataUrl:`data:image/jpeg;base64,${bytes.toString('base64')}`,clientId:99,userId:5});expect(visit.status).toBe('waiting');expect(visit.credential).toHaveLength(43);const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO private_virtual_office_visits'));expect(insert[0]).not.toMatch(/client_id|user_id/);expect(insert[1]).not.toContain(visit.credential);expect(insert[1][3]).not.toContain('data:image');});
 it('does not expose status to an enumerable numeric ID alone',async()=>{handler();await expect(officeGuestStatus(room,8,'')).rejects.toMatchObject({status:403});});
 it('does not issue video tokens before individual admission',async()=>{handler();await expect(officeGuestVideo(room,8,'a'.repeat(43))).rejects.toMatchObject({status:403});expect(mocks.video.generateToken).not.toHaveBeenCalled();});
 it('serializes capacity checks on the office row and rejects a second Premium guest',async()=>{handler({count:1});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalled();expect(mocks.execute.mock.calls.findIndex(([sql])=>sql.includes('FOR UPDATE'))).toBeLessThan(mocks.execute.mock.calls.findIndex(([sql])=>sql.includes('COUNT(*)')));});
 it('allows an additional individually admitted Premium Plus guest',async()=>{handler({count:2});mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:true});await expect(admitOfficeGuest(room,8)).resolves.toEqual({ok:true});expect(db.commit).toHaveBeenCalled();});
 it('requires the provider to be present before admitting',async()=>{handler({session:{video_session_id:'live',generation:2,host_seen_at:new Date(Date.now()-100000)}});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});});
 it('rejects previously admitted credentials from a different visit generation',async()=>{handler({guest:{id:8,status:'admitted',generation:1}});await expect(officeGuestVideo(room,8,'a'.repeat(43))).rejects.toMatchObject({status:403});});
 it('rotates stale office sessions and invalidates their guest admissions before reopening',async()=>{handler({session:{video_session_id:'old-session',generation:2,host_seen_at:new Date(Date.now()-100000)}});const token=await officeHostVideo(room);expect(mocks.video.endLiveSession).toHaveBeenCalledWith('old-session',{reason:'office_visit_ended'});expect(token.sessionId).toBe('new-session');expect(mocks.execute.mock.calls.some(([sql])=>sql.includes("status='ended',photo_envelope=NULL"))).toBe(true);});
 it('ends video and removes stored guest photos when the provider closes',async()=>{handler();await endOffice(room);expect(mocks.video.endLiveSession).toHaveBeenCalled();expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('video_session_id=NULL'))).toBe(true);expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('photo_envelope=NULL'))).toBe(true);});
});
it('will not identify an existing client from arbitrary lobby form fields',async()=>{handler();await expect(officeGuestVideo({...room,isActive:false},8,'a'.repeat(43))).rejects.toMatchObject({status:404});});
