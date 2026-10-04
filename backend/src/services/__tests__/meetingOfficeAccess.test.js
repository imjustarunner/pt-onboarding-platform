import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),membership:vi.fn(),plan:vi.fn(),video:{isVideoConfigured:vi.fn(),generateToken:vi.fn(),createSession:vi.fn(),endLiveSession:vi.fn()},room:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:mocks.membership}));
vi.mock('../meetingAccessPlan.service.js',()=>({getMeetingPlan:mocks.plan}));
vi.mock('../../models/ProviderMyRoom.model.js',()=>({default:{findBySlug:mocks.room}}));
vi.mock('../vonageVideo.service.js',()=>({default:mocks.video}));
vi.mock('../video.service.js',()=>({resolveVideoProjectId:()=> 'project'}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(x=>({ciphertextB64:'encrypted',size:x.length})),decryptChatText:vi.fn(()=> 'data:image/jpeg;base64,private')}));
const clinical=vi.hoisted(()=>({clinicalMedia:vi.fn(),requireActiveClinicalMedia:vi.fn(),requireMonitoredProvider:vi.fn(),clinicalVideoToken:vi.fn(),registerClinicalMedia:vi.fn(),requireClinicalVideoMonitoring:vi.fn(),requestClinicalEnd:vi.fn(),finishClinicalEnd:vi.fn()}));
vi.mock('../clinicalVideo.service.js',()=>clinical);
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn()}));
import {snapshotDataUrl,joinOffice,officeGuestStatus,officeGuestVideo,admitOfficeGuest,officeHostVideo,endOffice,officeWorkspaceContext} from '../privateVirtualOffice.service.js';
const room={id:1,userId:5,agencyId:2,isActive:true,displayName:'Provider'};
let db;
beforeEach(()=>{vi.clearAllMocks();clinical.clinicalMedia.mockResolvedValue({state:'active'});clinical.clinicalVideoToken.mockResolvedValue('video-token');clinical.finishClinicalEnd.mockResolvedValue({ok:false,state:'ending'});mocks.membership.mockResolvedValue(true);mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:false});mocks.video.isVideoConfigured.mockReturnValue(true);mocks.video.generateToken.mockReturnValue('video-token');mocks.video.createSession.mockResolvedValue('new-session');mocks.video.endLiveSession.mockResolvedValue({ok:true});db={execute:mocks.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(db);});
function handler({guest={id:8,status:'waiting',generation:2,photo_envelope:'photo',display_name:'Guest'},count=0,present=count,session={video_session_id:'live',generation:2,host_seen_at:new Date()}}={}){mocks.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT role'))return [[{role:'provider'}]];
 if(sql.includes('SELECT * FROM private_virtual_office_sessions'))return [[session]];
 if(sql.includes('COUNT(*)'))return [[{total:count,present}]];
 if(sql.includes('SELECT * FROM private_virtual_office_visits'))return [[guest]];
 return [{insertId:8,affectedRows:1}];
});}
describe('private office admission',()=>{
 it('rejects arbitrary URLs, forged MIME and oversized photos',()=>{for(const photo of ['https://example.com/photo.jpg','data:image/jpeg;base64,aGVsbG8=','data:image/png;base64,'+'A'.repeat(4*1024*1024)])expect(()=>snapshotDataUrl(photo)).toThrow();});
 it('requires acknowledgement only when a photo is supplied and enforces premium entitlement',async()=>{handler();await expect(joinOffice(room,{displayName:'Pat',photoRequiredAck:false,photoDataUrl:'data:image/jpeg;base64,test'})).rejects.toMatchObject({status:400});mocks.plan.mockResolvedValue({privateOffice:false});await expect(joinOffice(room,{})).rejects.toMatchObject({status:403});expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO private_virtual_office_visits'))).toBe(false);});
 it('creates an encrypted waiting visit without client or staff identity from caller input',async()=>{handler();const bytes=Buffer.alloc(120);bytes[0]=255;bytes[1]=216;bytes[2]=255;const visit=await joinOffice(room,{displayName:'Pat',photoRequiredAck:true,photoDataUrl:`data:image/jpeg;base64,${bytes.toString('base64')}`,clientId:99,userId:5});expect(visit.status).toBe('waiting');expect(visit.credential).toHaveLength(43);const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO private_virtual_office_visits'));expect(insert[0]).not.toMatch(/client_id|user_id/);expect(insert[1]).not.toContain(visit.credential);expect(insert[1][3]).not.toContain('data:image');});
 it('does not expose status to an enumerable numeric ID alone',async()=>{handler();await expect(officeGuestStatus(room,8,'')).rejects.toMatchObject({status:403});});
 it('does not issue video tokens before individual admission',async()=>{handler();await expect(officeGuestVideo(room,8,'a'.repeat(43))).rejects.toMatchObject({status:403});expect(mocks.video.generateToken).not.toHaveBeenCalled();});
 it('serializes capacity checks on the office row and rejects a second Premium guest',async()=>{handler({count:1});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalled();expect(mocks.execute.mock.calls.findIndex(([sql])=>sql.includes('FOR UPDATE'))).toBeLessThan(mocks.execute.mock.calls.findIndex(([sql])=>sql.includes('COUNT(*)')));});
 it('allows an explicitly intended couples or family participant',async()=>{handler({count:2});mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:true});await expect(admitOfficeGuest(room,8,{sameEncounter:true})).resolves.toEqual({ok:true});expect(db.commit).toHaveBeenCalled();});
 it('requires the provider to be present before admitting',async()=>{handler({session:{video_session_id:'live',generation:2,host_seen_at:new Date(Date.now()-100000)}});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});});
 it('rejects previously admitted credentials from a different visit generation',async()=>{handler({guest:{id:8,status:'admitted',generation:1}});await expect(officeGuestVideo(room,8,'a'.repeat(43))).rejects.toMatchObject({status:403});});
 it('reconnects the provider to the same encounter without silently replacing it',async()=>{handler({session:{video_session_id:'old-session',generation:2,host_seen_at:new Date(Date.now()-100000)}});const token=await officeHostVideo(room);expect(token.sessionId).toBe('old-session');expect(mocks.video.createSession).not.toHaveBeenCalled();});
 it('revokes access before disconnecting and keeps the encounter locked until closure is confirmed',async()=>{handler();expect(await endOffice(room)).toEqual({ok:false,state:'ending'});expect(clinical.requestClinicalEnd).toHaveBeenCalled();expect(clinical.finishClinicalEnd).toHaveBeenCalledWith('live');expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('video_session_id=NULL'))).toBe(false);expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('photo_envelope=NULL'))).toBe(true);});
 it('blocks a replacement patient even after every prior participant leaves',async()=>{handler({count:1,present:0});mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:true});for(const options of [{},{sameEncounter:true}])await expect(admitOfficeGuest(room,8,options)).rejects.toMatchObject({status:409});});
 it('never automatically admits a second Premium Plus participant without explicit same-encounter intent',async()=>{handler({count:1});mocks.plan.mockResolvedValue({privateOffice:true,multipleOfficeGuests:true});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});});
 it('creates a fresh isolated generation after confirmed provider closure',async()=>{handler();clinical.clinicalMedia.mockResolvedValue({state:'ended'});await officeHostVideo(room);expect(mocks.video.createSession).toHaveBeenCalled();expect(clinical.registerClinicalMedia.mock.calls[0][1]).toMatchObject({generation:3,agencyId:2,sessionId:1});});
 it('cannot reopen while disconnection is pending',async()=>{handler();clinical.clinicalMedia.mockResolvedValue({state:'ending'});await expect(officeHostVideo(room)).rejects.toMatchObject({status:409});expect(mocks.video.createSession).not.toHaveBeenCalled();});

});
it('will not identify an existing client from arbitrary lobby form fields',async()=>{handler();await expect(officeGuestVideo({...room,isActive:false},8,'a'.repeat(43))).rejects.toMatchObject({status:404});});

it('allows an anonymous visit without a name or photo and records the server supplied IP',async()=>{handler();const visit=await joinOffice(room,{},'2001:db8::1');expect(visit.guestDisplayName).toBe('Guest');const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO private_virtual_office_visits'));expect(insert[1][3]).toBeNull();expect(insert[1][4]).toBe('2001:db8::1');});
it('admits a waiting guest without a photo',async()=>{handler({guest:{id:8,status:'waiting',photo_envelope:null}});await expect(admitOfficeGuest(room,8)).resolves.toEqual({ok:true});});
it('does not admit a missing or already ended visit',async()=>{handler({guest:null});await expect(admitOfficeGuest(room,8)).rejects.toMatchObject({status:409});});

it('never treats an invalid public lobby id as the host workspace',async()=>{handler();for(const id of [0,NaN,-1])await expect(officeWorkspaceContext(room,{id,credential:'a'.repeat(43)})).rejects.toMatchObject({status:403});});
