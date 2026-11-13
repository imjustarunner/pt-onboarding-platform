import fs from 'node:fs';
import {expect,it,vi} from 'vitest';
import {requiresCaptchaForLink} from '../../utils/intakeCaptchaPolicy.js';

const source=fs.readFileSync(new URL('../publicIntake.controller.js',import.meta.url),'utf8');
const start=source.indexOf('export const createPublicIntakeSession = ');
const end=source.indexOf('export const postPublicIntakeReminderConsent = ',start);
const agency={id:377,name:'Inner Strength'};
const privateLink={id:912,is_active:1,public_key:'care-opaque',care_invitation:{providerName:'Michael Mendez',modality:'IN_PERSON'}};
function setup({link=privateLink,starts=0,used=false,body={}}={}) {
 const create=vi.fn(async()=>({id:900})),verify=vi.fn(async()=>({ok:true,score:0.9}));
 const deps={
  process:{env:{RECAPTCHA_REQUIRED_FOR_ALL:'true',RECAPTCHA_SITE_KEY_INTAKE:'public-site-key'}},
  validationResult:()=>({isEmpty:()=>true}),resolvePublicIntakeContext:async()=>({link}),
  assertClientUpdateSubmissionContext:vi.fn(),resolveIntakeOrgContext:async()=>({organization:agency,agency}),
  isSmartSchoolRoiForm:()=>false,requiresCaptchaForLink,config:{nodeEnv:'production',recaptcha:{secretKey:'synthetic-server-key'}},
  isLocalRecaptchaBypassRequest:()=>false,getClientIpAddress:()=> '203.0.113.10',verifyRecaptchaV3:verify,
  IntakeSubmission:{countStartsByLinkAndIp:vi.fn(async()=>starts),create,updateById:async()=>({id:900})},
  loadAllowedTemplates:async()=>[],isEnrollmentReminderLink:()=>true,REMINDER_DECLINE_TTL_MS:43200000,
  BASE_CONSENT_TTL_MS:86400000,PER_PAGE_TTL_MS:1000,crypto:{randomBytes:()=>({toString:()=> 'synthetic-session'})},
  pool:{execute:vi.fn(async()=>[used?[{id:901}]:[]])}
 };
 const handler=new Function(...Object.keys(deps),`${source.slice(start,end).replace('export const','const')} return createPublicIntakeSession;`)(...Object.values(deps));
 const req={params:{publicKey:link?.public_key||'missing'},body,get:name=>name==='host'?'auricwell.com':'Synthetic test browser',query:{skipCaptcha:true}};
 const next=vi.fn(),res={statusCode:200,status(code){this.statusCode=code;return this;},json:vi.fn()};
 return {create,verify,req,res,next,run:async()=>handler(req,res,next)};
}
it('starts a database-backed private care enrollment without contacting CAPTCHA',async()=>{
 const state=setup();await state.run();expect(state.next).not.toHaveBeenCalled();expect(state.res.statusCode).toBe(200);
 expect(state.res.json).toHaveBeenCalledWith(expect.objectContaining({sessionToken:'synthetic-session',submissionId:900}));
 expect(state.create).toHaveBeenCalledOnce();expect(state.verify).not.toHaveBeenCalled();
});
it('keeps CAPTCHA required for public enrollment even when the URL or request claims to be private',async()=>{
 const state=setup({link:{id:912,is_active:1,public_key:'care-forged'},body:{care_invitation:privateLink.care_invitation,skipCaptcha:true}});
 await state.run();expect(state.res.statusCode).toBe(400);expect(state.res.json).toHaveBeenCalledWith({error:{message:'Captcha is required'}});
 expect(state.create).not.toHaveBeenCalled();expect(state.verify).not.toHaveBeenCalled();
});
it('still verifies a provided CAPTCHA token on ordinary public links',async()=>{
 const state=setup({link:{id:912,is_active:1,public_key:'ordinary-office'},body:{captchaToken:'public-token'}});
 await state.run();expect(state.verify).toHaveBeenCalledWith(expect.objectContaining({token:'public-token',expectedAction:'public_intake_begin'}));expect(state.create).toHaveBeenCalledOnce();
});
it('retains the per-link daily start limit for private invitations',async()=>{
 const state=setup({starts:50});await state.run();expect(state.res.statusCode).toBe(429);expect(state.create).not.toHaveBeenCalled();
});
it('does not revive inactive or completed invitations',async()=>{
 const inactive=setup({link:{...privateLink,is_active:0}});await inactive.run();expect(inactive.res.statusCode).toBe(404);expect(inactive.create).not.toHaveBeenCalled();
 const complete=setup({used:true});await complete.run();expect(complete.next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(complete.create).not.toHaveBeenCalled();
});
