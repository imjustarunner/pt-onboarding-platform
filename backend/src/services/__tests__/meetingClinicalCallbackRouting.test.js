import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
const m=vi.hoisted(()=>({process:vi.fn()}));
vi.mock('../clinicalVideo.service.js',async importOriginal=>({...await importOriginal(),processClinicalCallback:m.process}));
vi.mock('../../config/database.js',()=>({default:{}}));
import router,{clinicalVideoCallbackPaths} from '../../routes/clinicalVideoCallback.routes.js';
let server,origin;
beforeAll(async()=>{
 vi.stubEnv('VONAGE_VIDEO_CALLBACK_SECRET','synthetic-test-secret');vi.stubEnv('VONAGE_APPLICATION_ID','synthetic-project');
 const app=express();app.use(clinicalVideoCallbackPaths,router);app.use(express.json());app.use((_req,res)=>res.sendStatus(401));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));vi.unstubAllEnvs();});
it('accepts signed raw callbacks at the canonical and currently configured addresses before staff authentication',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 const body=JSON.stringify({projectId:'synthetic-project',event:'connectionCreated',sessionId:'synthetic-session'});
 const token=jwt.sign({payload_hash:crypto.createHash('sha256').update(body).digest('hex')},'synthetic-test-secret',{expiresIn:'5m'});
 for(const path of clinicalVideoCallbackPaths){
  const request=(payload,authorization)=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization},body:payload});
  expect((await request(body,`Bearer ${token}`)).status).toBe(204);
  expect((await request('{}',`Bearer ${token}`)).status).toBe(401);
  expect((await request(body,'Bearer forged')).status).toBe(401);
 }
 expect(m.process).toHaveBeenCalledTimes(2);
});
