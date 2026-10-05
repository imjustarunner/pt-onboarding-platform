import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
vi.mock('../smsConsentRequest.service.js',()=>({viewSmsConsentRequest:vi.fn(),signSmsConsentRequest:vi.fn(),createSmsConsentRequest:vi.fn(),listSmsConsentRequests:vi.fn(),reviewSmsConsentRequest:vi.fn(),getSignedSmsEvidence:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
vi.mock('../../middleware/rateLimiter.middleware.js',()=>({publicIntakeLimiter:(_req,_res,next)=>next()}));
import {publicSmsConsentRouter} from '../../routes/smsConsent.routes.js';
function getExample(query, brand='itsco'){return new Promise((resolve,reject)=>{
 const req={method:'GET',url:`/consent-example/${brand}`,query};
 const res={set:vi.fn().mockReturnThis(),json:resolve};
 publicSmsConsentRouter.handle(req,res,error=>reject(error||new Error('Public example fell through to authentication')));
});}
describe('anonymous consent proof routing',()=>{
 it.each([['client',['care','reminders']],['staff',['workforce']]])('serves the %s example without authentication',async(audience,purposes)=>{
  const data=await getExample({program:'operations',audience});
  expect(data.example).toBe(true);expect(data.disclosure.brandName).toBe('ITSCO');
  expect(data.disclosure.purposes.map(p=>p.purpose).sort()).toEqual([...purposes].sort());
 });
 it.each([['nlu','Next Level Up'],['tisi','The Inner Strength Institute'],['itsco','ITSCO']])('isolates %s identity and audience without authentication',async(slug,name)=>{
  const client=await getExample({program:'operations',audience:'client',billing:'1'},slug);
  const staff=await getExample({program:'operations',audience:'staff'},slug);
  const marketing=await getExample({program:'marketing'},slug);
  expect(client.disclosure.brandName).toBe(name);
  expect(client.disclosure.termsUrl).toContain(`/${slug}/terms`);
  expect(client.disclosure.purposes.map(p=>p.purpose)).toContain('billing');
  expect(staff.disclosure.purposes.map(p=>p.purpose)).toEqual(['workforce']);
  expect(marketing.disclosure.purposes.map(p=>p.purpose)).toEqual(['marketing']);
  expect(staff.disclosure.purposes[0].label).toContain('video session');
  const withoutBilling=await getExample({program:'operations',audience:'client'},slug);
  expect(withoutBilling.disclosure.purposes.map(p=>p.purpose)).not.toContain('billing');
 });
 it('limits AuricWell proof to platform account security',async()=>{
  const result=await getExample({},'auricwell');
  expect(result.disclosure.brandName).toBe('AuricWell');
  expect(result.disclosure.purposes.map(p=>p.purpose)).toEqual(['account_security']);
  await expect(getExample({program:'operations'},'auricwell')).rejects.toMatchObject({status:400});
 });
 it('does not silently substitute ITSCO for an unknown brand or invalid program',async()=>{
  await expect(getExample({},'unknown')).rejects.toMatchObject({status:404});
  await expect(getExample({program:'anything'},'nlu')).rejects.toMatchObject({status:400});
  await expect(getExample({audience:'anything'},'nlu')).rejects.toMatchObject({status:400});
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
