import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{jwt:{secret:'rehearsal-route-test-secret'}}}));
vi.mock('../../controllers/itscoRehearsal.controller.js',()=>({rehearsalBootstrap:(req,res)=>res.json({agencyId:req.rehearsalAccess.agencyId}),rehearsalI9:(req,res)=>res.send('blank form')}));
vi.mock('../../controllers/hirePacketPreview.controller.js',()=>({packetPreviewOptions:(req,res)=>res.json({agencyId:req.rehearsalAccess.agencyId}),packetPreviewReference:(req,res)=>res.send('blank reference'),packetPreviewContract:(req,res)=>res.json({seeded:true}),packetPreviewJobFile:(req,res)=>res.send('blank job')}));
import express from 'express';
import {readFileSync} from 'node:fs';
import router from '../../routes/rehearsalAccess.routes.js';
import {createRehearsalAccess} from '../rehearsalAccess.service.js';
const app=express();app.use(express.json());app.use('/api/hiring/rehearsal-access',router);app.use('/api',(req,res)=>res.status(401).json({error:{message:'Staff login required'}}));app.use((e,req,res,next)=>res.status(e.status||500).json({error:{message:e.message}}));
let server,origin;
beforeAll(async()=>{await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;});
afterAll(async()=>{await new Promise(resolve=>server?.close(resolve));});
function request(){const run=(method,path)=>({async set(name,value){const r=await fetch(origin+path,{method,headers:{[name]:value}});return {status:r.status,body:await r.json()};}});return {get:path=>run('GET',path),post:path=>run('POST',path)};}
describe('incognito rehearsal routing',()=>{
 it('opens a scoped private test without a staff cookie',async()=>{const r=await request(app).get('/api/hiring/rehearsal-access/bootstrap?agencyId=9').set('Authorization',`Bearer ${createRehearsalAccess(2,7)}`);expect(r.status).toBe(200);expect(r.body.agencyId).toBe(2);});
 it('does not turn a rehearsal token into staff identity or permit mutations',async()=>{const token=createRehearsalAccess(2,7);expect((await request(app).post('/api/hiring/rehearsal-access/candidates').set('Authorization',`Bearer ${token}`)).status).toBe(404);expect((await request(app).post('/api/hiring/candidates').set('Authorization',`Bearer ${token}`)).status).toBe(401);});
 it('rejects missing and invalid links at the capability boundary',async()=>{for(const token of ['', 'bad']){const r=await request(app).get('/api/hiring/rehearsal-access/bootstrap').set('Authorization',token);expect(r.status).toBe(401);expect(r.body.error.message).toContain('private test link');}});
 it('mounts ahead of the production staff-authenticated catch-all routers',()=>{const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');expect(source.indexOf("app.use('/api/hiring/rehearsal-access'")).toBeLessThan(source.indexOf("app.use('/api', userInfoValueRoutes)"));});
});
