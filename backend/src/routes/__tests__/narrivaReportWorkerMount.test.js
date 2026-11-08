import {readFileSync} from 'node:fs';
import express from 'express';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../controllers/narrivaComplianceReports.controller.js',()=>({runJobs:vi.fn((req,res)=>res.json({queued:0,processed:0,receivedLimit:req.body?.limit}))}));
import router from '../narrivaReportWorker.routes.js';
import {runJobs} from '../../controllers/narrivaComplianceReports.controller.js';
let server,origin;
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubEnv('NARRIVA_REPORT_JOB_SECRET','synthetic-report-secret');vi.stubEnv('BILLING_JOB_SECRET','synthetic-billing-secret');
 const app=express();app.use(express.json());
 const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 // Replay actual mounting order so a later move behind catch-all auth breaks this test.
 const mounts=[...source.matchAll(/app\.use\('([^']+)', (narrivaReportWorkerRoutes|userCommunicationRoutes|userAdminDocsRoutes)\);/g)];
 expect(mounts.filter(match=>match[2]==='narrivaReportWorkerRoutes')).toHaveLength(1);
 const workerPosition=source.indexOf("app.use('/api/billing', narrivaReportWorkerRoutes)");
 expect(workerPosition).toBeGreaterThan(source.indexOf('app.use(securityEvidenceMiddleware)'));
 expect(workerPosition).toBeGreaterThan(source.indexOf("app.use('/api', auricwellPreviewBoundary)"));
 for(const [,path,name]of mounts)app.use(path,name==='narrivaReportWorkerRoutes'?router:(_req,res)=>res.status(401).json({error:'No token provided'}));
 await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
});
afterEach(async()=>{if(server)await new Promise(resolve=>server.close(resolve));vi.unstubAllEnvs();});
const call=(path='/api/billing/run-narriva-compliance',{method='POST',key='synthetic-report-secret'}={})=>fetch(origin+path,{method,headers:{...(key?{'x-billing-job-secret':key}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{"limit":1}'}:{})});
describe('Narriva worker reaches secret authentication before catch-all staff JWT authentication',()=>{
 it('accepts the dedicated secret without a staff login and invokes the worker once',async()=>{
  const response=await call();expect(response.status).toBe(200);expect(await response.json()).toEqual({queued:0,processed:0,receivedLimit:1});expect(runJobs).toHaveBeenCalledTimes(1);expect(runJobs.mock.calls[0][0].headers.authorization).toBeUndefined();
 });
 it.each([null,'wrong','synthetic-report-secrex','synthetic-billing-secret'])('rejects missing/wrong credentials without invoking work: %s',async key=>{
  const response=await call(undefined,{key});expect(response.status).toBe(401);expect(await response.json()).toEqual({error:{message:'Unauthorized'}});expect(runJobs).not.toHaveBeenCalled();
 });
 it('fails closed when no worker or fallback key is configured',async()=>{
  vi.stubEnv('NARRIVA_REPORT_JOB_SECRET','');vi.stubEnv('BILLING_JOB_SECRET','');expect((await call()).status).toBe(401);expect(runJobs).not.toHaveBeenCalled();
 });
 it('supports the existing billing secret only when the dedicated secret is absent',async()=>{
  vi.stubEnv('NARRIVA_REPORT_JOB_SECRET','');expect((await call(undefined,{key:'synthetic-billing-secret'})).status).toBe(200);expect(runJobs).toHaveBeenCalledTimes(1);
 });
 it.each([
  ['/api/billing/2/settings','POST'],['/api/billing/run-monthly','POST'],['/api/communications/pending','GET'],
  ['/api/billing/run-narriva-compliance','GET'],['/api/billing/run-narriva-compliance/extra','POST'],['/api/billing/run-narriva-compliance/','POST']
 ])('does not bypass staff authentication for %s (%s)',async(path,method)=>{
  const response=await call(path,{method});expect(response.status).toBe(401);expect(await response.json()).toEqual({error:'No token provided'});expect(runJobs).not.toHaveBeenCalled();
 });
});
