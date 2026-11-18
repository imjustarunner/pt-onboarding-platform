import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(req,res,next)=>next(),authenticateOptional:(req,res,next)=>next()}));
import {createPlotlineRouter} from '../plotline.routes.js';
let server;
afterEach(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function start(setup={}){
 const auth=(req,res,next)=>req.get('X-Test-Principal')?(req.user={id:1434},next()):res.status(401).json({error:{message:'Sign in'}});
 const optional=(req,res,next)=>{if(req.get('X-Test-Principal'))req.user={id:1434};next();};
 const app=express();app.use('/api/plotline',createPlotlineRouter({setup,auth,optionalAuth:optional,protect:async()=>{},captcha:()=>({siteKey:'public'})}));app.use((err,req,res,next)=>res.status(500).json({error:{message:'Unavailable'}}));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return `http://127.0.0.1:${server.address().port}/api/plotline`;
}
const headers={'content-type':'application/json','X-Plotline-Request':'1','X-Test-Principal':'local-test-only'};
it('GET verification links cannot consume a token or create a company',async()=>{const verify=vi.fn(),createCompany=vi.fn(),url=await start({verify,createCompany});expect((await fetch(url+'/verify')).status).toBe(401);expect(verify).not.toHaveBeenCalled();expect(createCompany).not.toHaveBeenCalled();});
it('requires ordinary authentication and same-site request intent on mutations',async()=>{const createCompany=vi.fn(),url=await start({createCompany});expect((await fetch(url+'/companies',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(403);expect((await fetch(url+'/companies',{method:'POST',headers:{'content-type':'application/json','X-Plotline-Request':'1'},body:'{}'})).status).toBe(401);expect((await fetch(url+'/companies',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site'},body:'{}'})).status).toBe(403);expect(createCompany).not.toHaveBeenCalled();});
it('takes the actor from verified authentication, not a caller-supplied user ID',async()=>{const createCompany=vi.fn(async()=>({agencyId:900})),url=await start({createCompany});const result=await fetch(url+'/companies',{method:'POST',headers,body:JSON.stringify({userId:1435,draftId:'draft',authorized:true,acceptTerms:true})});expect(result.status).toBe(201);expect(createCompany.mock.calls[0][0]).toBe(1434);});
it('returns capacity failures without exposing internal errors or pretending success',async()=>{const createCompany=async()=>{throw Object.assign(new Error('Today’s limit reached'),{status:429,code:'PLOTLINE_CAPACITY_LIMIT'});},url=await start({createCompany});const result=await fetch(url+'/companies',{method:'POST',headers,body:'{}'});expect(result.status).toBe(429);expect((await result.json()).error.code).toBe('PLOTLINE_CAPACITY_LIMIT');});
