import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
const mocks=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),permitted:vi.fn(),exchange:vi.fn(),authorize:vi.fn(),device:vi.fn(),unlock:vi.fn(),configureLock:vi.fn(),resume:vi.fn(),lockInfo:row=>({method:row.quick_code_hash?'code':'none',hasCode:!!row.quick_code_hash})}));
vi.mock('../../../middleware/auth.middleware.js',()=>({authenticate:(req,_res,next)=>{req.user={id:1,switchedFromUserId:req.get('X-Test-Impersonating')?2:null};req.sessionSecurity={key:'server-verification-key'};req.authClaims={iat:1794150000,authMethod:'google',demoMode:req.get('X-Test-Demo')==='1',testAccountSwitch:req.get('X-Test-Switch')==='1'};next();}}));
vi.mock('../../../middleware/loginProtection.middleware.js',()=>({sharedLoginLimiter:()=>((_req,_res,next)=>next())}));
vi.mock('../session.service.js',()=>({mobileSessions:mocks}));
vi.mock('../../quickViewAuth.service.js',()=>({touchSession:vi.fn()}));
vi.mock('../push.service.js',()=>({registerMobilePush:vi.fn(),pushConfiguration:()=>({}),createMobilePushWorker:()=>({permitted:mocks.permitted})}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
import {touchSession} from '../../quickViewAuth.service.js';
import mobileRoutes from '../../../routes/mobile.routes.js';
let server,base;
beforeAll(async()=>{const app=express();app.use(express.json(),cookieParser());app.use('/api/mobile',mobileRoutes);app.use((err,_req,res,_next)=>res.status(500).json({error:'unexpected'}));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/mobile`;});
afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
beforeEach(()=>{vi.clearAllMocks();touchSession.mockResolvedValue(null);mocks.exchange.mockResolvedValue({deviceToken:'private-durable-token',needsCode:true});mocks.authorize.mockResolvedValue({code:'one-use-code'});});
const post=(path,body={},headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Auricwell-Mobile':'1',...headers},body:JSON.stringify(body)});
it('keeps a browser durable token only in a secure HttpOnly cookie',async()=>{
  const response=await post('/exchange',{clientId:'web'});expect(response.status).toBe(200);
  const cookie=response.headers.get('set-cookie');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=Strict');expect(cookie).toContain('Path=/api/mobile');
  expect(await response.json()).toEqual({needsCode:true});expect(response.headers.get('cache-control')).toBe('no-store');
});
it('requires the custom request header for every state change',async()=>{
  const response=await fetch(base+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  expect(response.status).toBe(403);expect(mocks.exchange).not.toHaveBeenCalled();
});
it('cannot connect an impersonated/demo session or a different account than confirmed',async()=>{
  expect((await post('/authorize',{expectedUserId:2})).status).toBe(403);
  expect((await post('/authorize',{expectedUserId:1},{'X-Test-Impersonating':'1'})).status).toBe(403);
  expect((await post('/authorize',{expectedUserId:1},{'X-Test-Demo':'1'})).status).toBe(403);
  expect((await post('/authorize',{expectedUserId:1},{'X-Test-Switch':'1'})).status).toBe(403);
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect((await post('/authorize',{expectedUserId:1,agencyId:10})).status).toBe(200);
});
it('never returns the private profile in the locked device status',async()=>{
  mocks.device.mockResolvedValue({device:{quick_code_hash:'hash'},workspace:{id:10,name:'Test'},user:{password_hash:'private'}});
  const response=await fetch(base+'/session',{headers:{Cookie:'__Secure-auricwell_mobile_device=secret'}});
  expect(await response.json()).toEqual({signedIn:true,needsCode:false,appLock:{method:'code',hasCode:true},workspace:{id:10,name:'Test'}});
  expect(mocks.device).toHaveBeenCalledWith('secret');
});

it('refreshes the browser credential lifetime on successful code unlock, without exposing it',async()=>{
  mocks.unlock.mockResolvedValue({sessionToken:'short-access'});
  const response=await post('/unlock',{passcode:'123456'},{Cookie:'__Secure-auricwell_mobile_device=existing-device-secret'});
  expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('Max-Age=7776000');
  expect(await response.json()).toEqual({sessionToken:'short-access'});
});

it('cannot turn off an app lock with only the retained device cookie',async()=>{
  const response=await post('/app-lock',{method:'none'},{Cookie:'__Secure-auricwell_mobile_device=secret'});
  expect(response.status).toBe(423);expect(mocks.configureLock).not.toHaveBeenCalled();
});

it('opens a notification at its exact authorized secure reply without exchanging sign-in again',async()=>{
 touchSession.mockResolvedValue({mobileDeviceSessionId:7,userId:1,agencyId:10});mocks.access.mockResolvedValue({device:{id:7,user_id:1,agency_id:10}});mocks.permitted.mockResolvedValue(55);mocks.execute.mockResolvedValue([[{parent_message_id:77,message_channel:'secure'}]]);
 const response=await fetch(base+'/notification-target/chat/88',{headers:{'X-Quick-View-Session':'retained-scoped'}});expect(response.status).toBe(200);expect(await response.json()).toEqual({threadId:'55',messageId:'88',parentId:'77',suite:'secure',secure:'1'});expect(mocks.exchange).not.toHaveBeenCalled();
});
it('does not resolve a notification after its conversation access has been revoked',async()=>{
 touchSession.mockResolvedValue({mobileDeviceSessionId:7,userId:1,agencyId:10});mocks.access.mockResolvedValue({device:{id:7,user_id:1,agency_id:10}});mocks.permitted.mockResolvedValue(null);
 const response=await fetch(base+'/notification-target/chat/88',{headers:{'X-Quick-View-Session':'retained-scoped'}});expect(response.status).toBe(404);expect(mocks.execute).not.toHaveBeenCalled();
});

it('keeps verified enrollment context server-owned instead of accepting a client claim',async()=>{
 const response=await post('/authorize',{expectedUserId:1,agencyId:10,primaryAuthentication:{sessionKey:'forged',authMethod:'google',issuedAt:9999999999}});
 expect(response.status).toBe(200);expect(mocks.authorize).toHaveBeenCalledWith(expect.objectContaining({primaryAuthentication:{sessionKey:'server-verification-key',authMethod:'google',issuedAt:1794150000}}));
});
