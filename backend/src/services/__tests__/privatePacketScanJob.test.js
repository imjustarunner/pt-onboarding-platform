import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { queuePrivatePacketScan } from '../privatePacketScanJob.service.js';
const jobName='projects/example/locations/us-west3/jobs/private-scan';
const input={doc:{id:9,scan_result:null},clientId:4,actorId:8};
const fixture=()=>({jobName,now:()=>1000000,db:{execute:vi.fn(async()=>[{affectedRows:1}])},request:vi.fn(async()=>({}))});
it('sends only scoped IDs to an authenticated job API, with a five-minute limit and one task',async()=>{
 const deps=fixture();expect(await queuePrivatePacketScan(input,deps)).toMatchObject({status:'pending'});
 const [url,body]=deps.request.mock.calls[0];expect(url).toBe(`https://run.googleapis.com/v2/${jobName}:run`);
 expect(body.overrides).toMatchObject({taskCount:1,timeout:'300s'});
 expect(body.overrides.containerOverrides[0].env.map(row=>row.name)).toEqual(['PACKET_SCAN_DOCUMENT_ID','PACKET_SCAN_CLIENT_ID','PACKET_SCAN_ACTOR_ID','PACKET_SCAN_MARKER']);
 expect(deps.db.execute.mock.calls[0][1].slice(1)).toEqual([9,4,null]);
});
it('does not launch a duplicate while a prior check is queued, or after a concurrent claim',async()=>{
 const deps=fixture();await queuePrivatePacketScan({...input,doc:{id:9,scan_result:'private_scan_queued:999999:test'}},deps);expect(deps.request).not.toHaveBeenCalled();expect(deps.db.execute).not.toHaveBeenCalled();
 deps.db.execute.mockResolvedValue([{affectedRows:0}]);await queuePrivatePacketScan(input,deps);expect(deps.request).not.toHaveBeenCalled();
});
it('preserves an unknown send for review instead of immediately launching a second job',async()=>{
 const deps=fixture();deps.request.mockRejectedValue(Error('transport timeout'));
 expect((await queuePrivatePacketScan(input,deps)).message).toContain('unknown outcome');expect(deps.db.execute).toHaveBeenCalledOnce();
});
it('does not use an arbitrary destination or silently claim scanning is configured',async()=>{
 const deps=fixture();deps.jobName='https://external.example.test/upload';expect(await queuePrivatePacketScan(input,deps)).toBeNull();expect(deps.request).not.toHaveBeenCalled();expect(deps.db.execute).not.toHaveBeenCalled();
});
it('queues clinical bytes by immutable document/client/session IDs only and never sends bytes to the job API',async()=>{
 const deps=fixture();await queuePrivatePacketScan({doc:{id:9,client_id:4,is_encrypted:1,document_type:'session_supporting_material'},clientId:4,actorId:8,kind:'session_material',clinicalSessionId:166},deps);
 const env=deps.request.mock.calls[0][1].overrides.containerOverrides[0].env;
 expect(env).toContainEqual({name:'PACKET_SCAN_KIND',value:'session_material'});expect(env).toContainEqual({name:'PACKET_SCAN_CLINICAL_SESSION_ID',value:'166'});
 expect(JSON.stringify(env)).not.toContain('storage');expect(JSON.stringify(env)).not.toContain('buffer');
});
it.each([{kind:'other'},{kind:'session_material',clinicalSessionId:0},{kind:'session_material',clinicalSessionId:166,doc:{id:9,client_id:99,is_encrypted:1,document_type:'session_supporting_material'}}])('rejects an unsupported or mismatched clinical worker request before dispatch %j',async change=>{
 const deps=fixture();await expect(queuePrivatePacketScan({...input,...change},deps)).rejects.toThrow();expect(deps.request).not.toHaveBeenCalled();
});
