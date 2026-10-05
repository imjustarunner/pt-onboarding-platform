import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
vi.mock('../smsConsentRequest.service.js',()=>({viewSmsConsentRequest:vi.fn(),signSmsConsentRequest:vi.fn(),createSmsConsentRequest:vi.fn(),listSmsConsentRequests:vi.fn(),reviewSmsConsentRequest:vi.fn(),getSignedSmsEvidence:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
vi.mock('../../middleware/rateLimiter.middleware.js',()=>({publicIntakeLimiter:(_req,_res,next)=>next()}));
import {publicSmsConsentRouter} from '../../routes/smsConsent.routes.js';
function getExample(query){return new Promise((resolve,reject)=>{
 const req={method:'GET',url:'/consent-example/itsco',query};
 const res={set:vi.fn().mockReturnThis(),json:resolve};
 publicSmsConsentRouter.handle(req,res,error=>reject(error||new Error('Public example fell through to authentication')));
});}
describe('anonymous consent proof routing',()=>{
 it.each([['client',['care','reminders']],['staff',['workforce']]])('serves the %s example without authentication',async(audience,purposes)=>{
  const data=await getExample({program:'operations',audience});
  expect(data.example).toBe(true);expect(data.disclosure.brandName).toBe('ITSCO');
  expect(data.disclosure.purposes.map(p=>p.purpose).sort()).toEqual([...purposes].sort());
 });
 it('mounts public consent before the broad authenticated API routers',()=>{
  const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
  const mount=source.indexOf("app.use('/api/sms-numbers', publicSmsConsentRouter)");
  expect(mount).toBeGreaterThan(0);
  for(const router of ['userInfoValueRoutes','userChecklistAssignmentRoutes','momentumStickiesRoutes','momentumChatRoutes','taskListsRoutes']){
   const gate=source.indexOf(`app.use('/api', ${router})`);
   expect(gate).toBeGreaterThan(mount);
  }
 });
});
