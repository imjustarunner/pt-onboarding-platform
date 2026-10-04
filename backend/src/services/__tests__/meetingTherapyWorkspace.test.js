import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:m.audit}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:text=>({encrypted:text}),decryptChatText:value=>value.encrypted}));
import {validateArtifact,appendWorkspace,readWorkspace,recordWorkspaceDownload} from '../therapyWorkspace.service.js';
const office={kind:'office',sessionId:1,generation:2,agencyId:3,actor:'guest-2',visitId:2,role:'client'};
let db,media,visit,shared,artifacts;
beforeEach(()=>{
 vi.clearAllMocks();media={state:'active'};visit={id:2};shared=null;artifacts=[];
 db={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);m.audit.mockResolvedValue();
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM clinical_video_sessions'))return [media?[media]:[]];
  if(sql.includes('FROM private_virtual_office_visits'))return [visit?[visit]:[]];
  if(sql.includes("artifact_type='share'"))return [shared?[{payload_envelope:JSON.stringify({encrypted:JSON.stringify(shared)})}]:[]];
  if(sql.startsWith('SELECT'))return [artifacts];
  return [{insertId:9}];
 });
});
describe('clinical encounter content',()=>{
 it('lets the client share materials but keeps treatment plans provider-controlled',()=>{
  expect(validateArtifact(office,{type:'share',payload:{mode:'resource',url:'https://example.com'}}).type).toBe('share');
  expect(()=>validateArtifact(office,{type:'share',payload:{mode:'treatment'}})).toThrow();
  expect(()=>validateArtifact({...office,role:'provider',clientId:9},{type:'share',payload:{mode:'treatment'}})).toThrow();
 });
 it('rejects executable links, forged documents and executable drawing markup',()=>{
  for(const payload of [{mode:'resource',url:'javascript:alert(1)'},{mode:'pdf',document:'data:text/html;base64,abc'}])expect(()=>validateArtifact(office,{type:'share',payload})).toThrow();
  for(const payload of [{shareId:2,points:[[1001,1]],color:'#123456'},{shareId:2,points:[[1,1]],color:'<script>'}])expect(()=>validateArtifact(office,{type:'drawing',payload})).toThrow();
 });
 it('writes encrypted content only after admission and commits its audit in the same transaction',async()=>{
  await appendWorkspace(office,{type:'chat',payload:{text:'Hello'}});
  const [,args]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO therapy_session_artifacts'));
  expect(args.slice(0,4)).toEqual(['office',1,2,3]);expect(JSON.parse(args[7])).toEqual({encrypted:JSON.stringify({text:'Hello'})});
  expect(m.audit).toHaveBeenCalledWith(office,'clinical_content_saved',{artifactId:9,artifactType:'chat'},db);expect(db.commit).toHaveBeenCalled();
 });
 it('prevents reads and writes using a context resolved just before the provider ended the encounter',async()=>{
  media.state='ending';await expect(readWorkspace(office)).rejects.toMatchObject({status:410});await expect(appendWorkspace(office,{type:'chat',payload:{text:'late'}})).rejects.toMatchObject({status:410});
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM therapy_session_artifacts')||sql.startsWith('INSERT'))).toBe(false);
 });
 it('denies departed guests even while other couples participants are still admitted',async()=>{visit=null;await expect(readWorkspace(office)).rejects.toMatchObject({status:403});});
 it('does not allow a guest to opt into provider archive access',async()=>{await expect(readWorkspace({...office,historical:true})).rejects.toMatchObject({status:403});});
 it('rejects a different tenant or missing generation without querying content',async()=>{media=null;await expect(readWorkspace({...office,agencyId:99})).rejects.toMatchObject({status:404});expect(m.execute).toHaveBeenCalledTimes(1);expect(m.execute.mock.calls[0][1]).toEqual(['office',1,2,99]);});
 it('rejects a response or download reference from another encounter',async()=>{
  await expect(appendWorkspace(office,{type:'response',payload:{shareId:99,answers:['yes']}})).rejects.toMatchObject({status:404});
  await expect(recordWorkspaceDownload(office,99)).rejects.toMatchObject({status:404});
 });
 it('only accepts the identified client rating their own shared plan',async()=>{shared={mode:'treatment',clientId:5};await expect(appendWorkspace({...office,clientId:6},{type:'rating',payload:{shareId:1,value:8}})).rejects.toMatchObject({status:400});});
 it('logs artifact IDs without copying clinical content into audit evidence',async()=>{
  artifacts=[{id:7,actor_role:'client',artifact_type:'chat',payload_envelope:JSON.stringify({encrypted:JSON.stringify({text:'private clinical details'})})}];
  expect((await readWorkspace(office)).artifacts[0].payload.text).toBe('private clinical details');expect(JSON.stringify(m.audit.mock.calls)).not.toContain('private clinical details');
 });
 it('fails closed on read and write when the durable audit cannot be stored',async()=>{
  artifacts=[{id:7}];m.audit.mockRejectedValue(new Error('audit unavailable'));
  await expect(readWorkspace(office)).rejects.toThrow('audit unavailable');await expect(appendWorkspace(office,{type:'chat',payload:{text:'Hello'}})).rejects.toThrow('audit unavailable');expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
 });
 it('does not persist active content smuggled through chat',()=>{expect(validateArtifact(office,{type:'chat',payload:{text:'Hi',url:'javascript:alert(1)',document:'data:text/html,unsafe'}})).toEqual({type:'chat',payload:{text:'Hi'}});});
});
