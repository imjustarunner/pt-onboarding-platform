import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),disconnectClient:vi.fn(),generateToken:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
vi.mock('../vonageVideo.service.js',()=>({default:m}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:m.audit}));
import { verifyClinicalCallback, processClinicalCallback, finishClinicalEnd, requestClinicalEnd, clinicalVideoToken, requireMonitoredProvider, clinicalAttendance } from '../clinicalVideo.service.js';
let db,media,connections,grants;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('VONAGE_VIDEO_CALLBACK_SECRET','test-secret');vi.stubEnv('VONAGE_APPLICATION_ID','project');
 media={media_id:'media',session_kind:'office',session_id:1,generation:2,agency_id:3,state:'active'};connections=[];grants=[];
 db={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);m.disconnectClient.mockResolvedValue(true);m.audit.mockResolvedValue();
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM clinical_video_sessions'))return [[media]];
  if(sql.startsWith('SELECT * FROM clinical_video_grants'))return [grants.filter(g=>g.id===args[0])];
  if(sql.includes('SELECT connection_id FROM clinical_video_connections'))return [connections.filter(c=>!c.disconnected_at)];
  if(sql.includes(') connections,'))return [[{connections:connections.filter(c=>!c.disconnected_at).length,tokens:grants.filter(g=>new Date(g.expires_at)>new Date()).length}]];
  if(sql.includes('SELECT COUNT(*) total FROM clinical_video_connections'))return [[{total:connections.filter(c=>!c.disconnected_at).length}]];
  if(sql.includes("SET state='ending'"))media.state='ending';
  if(sql.includes("SET state='ended'"))media.state='ended';
  if(sql.startsWith('UPDATE clinical_video_grants'))grants.forEach(g=>g.revoked_at=new Date());
  if(sql.startsWith('UPDATE clinical_video_connections SET disconnected_at')){const c=connections.find(c=>c.connection_id===args[1]);if(c)c.disconnected_at=new Date();}
  return [{affectedRows:1}];
 });
});
function callback(overrides={}){return {projectId:'project',sessionId:'media',event:'connectionCreated',timestamp:Date.now(),connection:{id:'connection',createdAt:Date.now(),data:JSON.stringify({grantId:'grant'})},...overrides};}
describe('signed video connection monitoring',()=>{
 it('requires signature, exact payload and project binding',()=>{
  const raw=Buffer.from(JSON.stringify(callback()));
  const signed=jwt.sign({payload_hash:crypto.createHash('sha256').update(raw).digest('hex')},'test-secret',{expiresIn:'5m'});
  expect(verifyClinicalCallback(raw,`Bearer ${signed}`).sessionId).toBe('media');
  expect(()=>verifyClinicalCallback(Buffer.from('{}'),`Bearer ${signed}`)).toThrow('payload');
  expect(()=>verifyClinicalCallback(raw,'Bearer forged')).toThrow('signature');
  expect(()=>verifyClinicalCallback(raw,`Bearer ${signed}`,{VONAGE_VIDEO_CALLBACK_SECRET:'test-secret',VONAGE_APPLICATION_ID:'other'})).toThrow('project');
 });
 it('rejects an old signed callback and wrong signing algorithm',()=>{
  const raw=Buffer.from(JSON.stringify(callback()));const payload_hash=crypto.createHash('sha256').update(raw).digest('hex');
  for(const token of [jwt.sign({payload_hash,iat:Math.floor(Date.now()/1000)-90000},'test-secret'),jwt.sign({payload_hash},'test-secret',{algorithm:'HS384'})])expect(()=>verifyClinicalCallback(raw,`Bearer ${token}`)).toThrow('signature');
 });
 it('disconnects a late connection after the provider ends the encounter',async()=>{
  media.state='ended';grants=[{id:'grant',actor:'client',revoked_at:new Date(),expires_at:new Date(Date.now()+60000)}];
  await processClinicalCallback(callback());expect(m.disconnectClient).toHaveBeenCalledWith('media','connection');
  expect(m.audit.mock.calls.some(([,action])=>action==='clinical_media_connection_denied')).toBe(true);
 });
 it('disconnects unknown credentials and retains a failed disconnect for retry',async()=>{
  m.disconnectClient.mockRejectedValue(new Error('network'));
  await expect(processClinicalCallback(callback())).rejects.toThrow('network');
  const insert=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO clinical_video_connections'));
  expect(insert[1].at(-1)).toBe(true);expect(db.commit).toHaveBeenCalled();
 });
 it('records legitimate subscriber-only connections without requiring a published stream',async()=>{
  grants=[{id:'grant',actor:'client',participant_role:'client',visit_id:7,expires_at:new Date(Date.now()+60000)}];
  await processClinicalCallback(callback());expect(m.disconnectClient).not.toHaveBeenCalled();
  expect(m.audit.mock.calls[0][1]).toBe('clinical_media_connected');
 });
 it('does not admit a client before the provider connection has been confirmed by monitoring',async()=>{
  m.execute.mockImplementation(async sql=>sql.startsWith('SELECT * FROM clinical_video_sessions')?[[media]]:[[]]);
  await expect(requireMonitoredProvider('media')).rejects.toMatchObject({status:409});
 });
});
describe('provider-controlled closure',()=>{
 it('blocks all new tokens once closure starts',async()=>{
  await requestClinicalEnd('media');await expect(clinicalVideoToken('media',{actor:'client',role:'client'})).rejects.toMatchObject({status:409});expect(m.generateToken).not.toHaveBeenCalled();
 });
 it('keeps the room locked on any remote disconnection failure',async()=>{
  media.state='ending';connections=[{connection_id:'quiet-subscriber'}];m.disconnectClient.mockRejectedValue(new Error('provider down'));
  expect(await finishClinicalEnd('media')).toMatchObject({ok:false,state:'ending'});expect(media.state).toBe('ending');
 });
 it('keeps the room locked while an already issued token could reconnect',async()=>{
  media.state='ending';grants=[{expires_at:new Date(Date.now()+60000)}];
  expect(await finishClinicalEnd('media')).toMatchObject({ok:false,state:'ending'});
 });
 it('finishes only after known connections are disconnected and token windows expire',async()=>{
  media.state='ending';media.empty_confirmed_at=new Date();connections=[{connection_id:'camera-off'}];
  expect(await finishClinicalEnd('media')).toMatchObject({ok:true,state:'ended'});
  expect(m.disconnectClient).toHaveBeenCalledWith('media','camera-off');expect(db.commit).toHaveBeenCalled();
 });
 it('does not call missing connections a failure, but does not swallow forbidden responses',async()=>{
  media.state='ending';media.empty_confirmed_at=new Date();connections=[{connection_id:'gone'}];m.disconnectClient.mockRejectedValue({response:{status:404}});
  expect((await finishClinicalEnd('media')).ok).toBe(true);
 });
 it('waits for signed empty-room confirmation even when all known connections are gone',async()=>{media.state='ending';expect(await finishClinicalEnd('media')).toMatchObject({ok:false,state:'ending'});});
 it('merges overlapping device connections for attendance instead of double-counting',async()=>{
  const at=n=>new Date(n*1000);m.execute.mockResolvedValue([[{visit_id:7,connected_at:at(10),disconnected_at:at(20)},{visit_id:7,connected_at:at(15),disconnected_at:at(30)},{visit_id:7,connected_at:at(40),disconnected_at:at(50)}]]);
  expect((await clinicalAttendance('office',1)).get(7)).toBe(30);
 });
});
