import express from 'express';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(_req,_res,next)=>next(),authenticateOptional:(_req,_res,next)=>next()}));
vi.mock('../noteworthyPayroll.service.js',()=>({default:{}}));
vi.mock('../noteworthyReadiness.service.js',()=>({default:{}}));
import {createNoteworthyRouter} from '../../routes/noteworthy.routes.js';
let server,payroll,readiness;
beforeEach(async()=>{
  payroll={signup:vi.fn().mockResolvedValue({verificationRequired:true}),verify:vi.fn().mockResolvedValue({passwordRequired:true,verified:false}),workspace:vi.fn().mockResolvedValue({practices:[{agencyId:1,role:'owner'},{agencyId:2,role:'employee'}]}),owner:vi.fn().mockResolvedValue({}),paystubs:vi.fn().mockResolvedValue({paystubs:[]}),updateRoster:vi.fn().mockResolvedValue({saved:true})};
  readiness={activation:vi.fn().mockResolvedValue({canImport:false})};
  const app=express();app.use('/api/noteworthy',createNoteworthyRouter({payroll,dataReadiness:readiness,trial:{assertReadable:async()=>{},assertWritable:async()=>{}},auth:(req,_res,next)=>{req.user={id:7};next();},optionalAuth:(_req,_res,next)=>next()}));
  app.use((error,_req,res,_next)=>res.status(500).json({error:{message:error.message}}));
  server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));instance.on('error',reject);});
});
afterEach(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function request(path,{method='GET',body,headers={}}={}) {
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/noteworthy${path}`,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,headers:response.headers,body:await response.json()};
}
it('requires deliberate same-site workspace writes before starting signup or an employee mutation',async()=>{
  expect((await request('/signup',{method:'POST',body:{email:'synthetic@example.test'}})).status).toBe(403);
  expect((await request('/signup',{method:'POST',headers:{'X-Noteworthy-Request':'1','Sec-Fetch-Site':'cross-site'},body:{}})).status).toBe(403);
  expect(payroll.signup).not.toHaveBeenCalled();
  expect((await request('/signup',{method:'POST',headers:{'X-Noteworthy-Request':'1'},body:{}})).status).toBe(201);
});
it('includes owner readiness only and disables caching of confidential workspace responses',async()=>{
  const result=await request('/workspace');expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('no-store');
  expect(readiness.activation).toHaveBeenCalledTimes(1);expect(readiness.activation).toHaveBeenCalledWith(1);
  expect(result.body.practices[1]).not.toHaveProperty('activation');
});
it('passes a recipient password only on the explicit token-verification request',async()=>{
  const token='a'.repeat(64),headers={'X-Noteworthy-Request':'1'};
  expect((await request('/verify',{method:'POST',headers,body:{token}})).body).toEqual({passwordRequired:true,verified:false});
  expect(payroll.verify).toHaveBeenLastCalledWith(token,undefined);
  const password='Recipient!ChosenPassword2026';
  await request('/verify',{method:'POST',headers,body:{token,password}});
  expect(payroll.verify).toHaveBeenLastCalledWith(token,password);
});
it('uses authenticated identity for the employee portal and rejects malformed record identifiers',async()=>{
  expect((await request('/practices/2/me/paystubs')).status).toBe(200);expect(payroll.paystubs).toHaveBeenCalledWith(7,2);
  expect((await request('/practices/not-an-agency/me/paystubs')).status).toBe(400);
  expect((await request('/practices/2/roster/NaN',{method:'PATCH',headers:{'X-Noteworthy-Request':'1'},body:{}})).status).toBe(400);
  expect(payroll.updateRoster).not.toHaveBeenCalled();
});
