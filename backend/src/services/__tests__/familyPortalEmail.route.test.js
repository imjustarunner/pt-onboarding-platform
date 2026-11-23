import {beforeEach,it,expect,vi} from 'vitest';
import {JSDOM} from '../../../../frontend/node_modules/jsdom/lib/api.js';
const m=vi.hoisted(()=>({context:vi.fn(),submit:vi.fn()}));
vi.mock('../appointmentEmailActions.service.js',()=>({appointmentEmailActionContext:m.context,submitAppointmentEmailAction:m.submit,appointmentEmailActions:school=>school?['cancel']:['confirm','cancel','reschedule'],actionLabels:{confirm:'Confirm',cancel:'Cancel',reschedule:'New time'}}));
vi.mock('../appointmentEmailDetails.service.js',()=>({appointmentEmailTutorName:async a=>a.businessType==='tutoring'?'Finley QA':''}));
vi.mock('../appointmentJoinEmail.service.js',()=>({appointmentJoinEmail:async()=>({url:'https://example.test/tutoring/invite#synthetic-only',label:'Join tutoring session'})}));
vi.mock('../appointmentServiceSetting.service.js',()=>({formatAppointmentTime:()=> 'Wednesday, 2 PM'}));
vi.mock('../clinicalPortalSetupEmail.service.js',()=>({readClinicalPortalSetup:vi.fn(),completeClinicalPortalSetup:vi.fn()}));
import router from '../../routes/publicAppointmentResponse.routes.js';
import express from 'express';
import {createRequire} from 'node:module';
const handler=method=>router.stack.find(l=>l.route?.path === '/:token' && l.route.methods[method]).route.stack[0].handle;
let res,req;
beforeEach(()=>{
 vi.resetAllMocks();res={set:vi.fn().mockReturnThis(),type:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn(),redirect:vi.fn()};
 req={params:{token:'a'.repeat(64)},query:{action:'cancel'},baseUrl:'/api/public/appointment-response',body:{},get:h=>h==='host'?'portal.example.test':undefined};
 m.context.mockResolvedValue({row:{status:'ready'},appt:{},setting:{isSchool:false},context:{tenant:{name:'ITSCO'},brand:{name:'ITSCO',displayName:'AuricWell Portal',clinical:true,products:[],replyTo:'support@itsco.health'}}});
});
it('GET renders a review form without applying a response, including email-link prefetch',async()=>{
 req.get=h=>h==='sec-purpose'?'prefetch':undefined;await handler('get')(req,res);expect(res.send.mock.calls[0][0]).toContain('method="post"');expect(res.send.mock.calls[0][0]).toContain('name="action" value="cancel"');expect(res.send.mock.calls[0][0]).not.toContain('<script');expect(m.submit).not.toHaveBeenCalled();
});
it('accepts the canonical AuricWell origin when a reverse proxy supplies the backend host',async()=>{
 req.body={confirm:'yes',action:'confirm'};req.get=h=>h==='origin'?'https://auricwell.com':h==='host'?'backend-service.run.app':undefined;
 await handler('post')(req,res);expect(m.submit).toHaveBeenCalledWith(req.params.token,'confirm');expect(res.status).not.toHaveBeenCalled();
});
it('confirms from the email link using one browser POST while GET itself stays read-only',async()=>{
 req.query.action='confirm';await handler('get')(req,res);expect(m.submit).not.toHaveBeenCalled();
 const html=res.send.mock.calls[0][0],post=vi.fn();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){window.HTMLFormElement.prototype.requestSubmit=post;}});
 expect(post).toHaveBeenCalledTimes(1);expect(html).not.toContain('<select');
 dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));expect(post).toHaveBeenCalledTimes(1);
 const nonce=html.match(/<script nonce="([^"]+)"/)[1];expect(res.set).toHaveBeenCalledWith('Content-Security-Policy',expect.stringContaining(`'nonce-${nonce}'`));dom.window.close();
});
it('does not auto-submit prefetches, a neutral landing page, or school confirmations',async()=>{
 req.query.action='confirm';req.get=h=>h==='sec-purpose'?'prefetch':undefined;await handler('get')(req,res);expect(res.send.mock.lastCall[0]).not.toContain('<script');
 req.query={};await handler('get')(req,res);expect(res.send.mock.lastCall[0]).not.toContain('<script');
 const current=await m.context();m.context.mockResolvedValue({...current,setting:{isSchool:true}});req.query.action='confirm';
 await handler('get')(req,res);expect(res.send.mock.lastCall[0]).not.toContain('<script');expect(res.send.mock.lastCall[0]).not.toContain('>Confirm</button>');
});
it('requires an explicit submission and rejects a foreign-origin form',async()=>{
 await handler('post')(req,res);expect(res.status).toHaveBeenCalledWith(400);expect(m.submit).not.toHaveBeenCalled();
 req.body={confirm:'yes',action:'cancel'};req.get=h=>h==='origin'?'https://evil.example.test':'portal.example.test';
 await handler('post')(req,res);expect(res.status).toHaveBeenCalledWith(403);expect(m.submit).not.toHaveBeenCalled();
});
it('accepts an explicit same-origin response and redirects to its receipt',async()=>{
 req.body={confirm:'yes',action:'confirm'};req.get=h=>h==='origin'?'https://portal.example.test':'portal.example.test';
 await handler('post')(req,res);expect(m.submit).toHaveBeenCalledWith(req.params.token,'confirm');expect(res.redirect).toHaveBeenCalledWith(303,`${req.baseUrl}/${req.params.token}`);
});
it.skipIf(process.env.NLU_EMAIL_BROWSER!=='1')('confirms through an actual signed-out browser POST without a null Origin',async()=>{
 const app=express();app.use(express.urlencoded({extended:false}));app.use('/api/public/appointment-response',router);
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const origin='http://127.0.0.1:'+server.address().port;
 const context={row:{status:'ready'},appt:{},setting:{isSchool:false},context:{tenant:{name:'NLU QA'},brand:{name:'NLU QA',products:[]},url:()=>origin}};
 m.context.mockImplementation(async()=>context);m.submit.mockImplementation(async()=>{context.row={status:'completed',result_message:'Your appointment is confirmed.'};});
 const require=createRequire(new URL('../../../../frontend/package.json',import.meta.url));
 const {chromium}=require('playwright');const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{const page=await browser.newPage();const origins=[];page.on('request',request=>{if(request.method()==='POST')origins.push(request.headers().origin);});
  for(const action of ['confirm','cancel','reschedule']){context.row=action==='cancel'?{status:'completed',chosen_action:'confirm',result_message:'Previously confirmed'}:{status:'ready'};context.appt.status='confirmed';context.context.learning=true;await page.goto(origin+'/api/public/appointment-response/'+req.params.token+'?action='+action);
  await page.getByRole('heading',{name:'Response received'}).waitFor();
  expect(await page.locator('body').textContent()).toContain('Your appointment is confirmed.');expect(m.submit).toHaveBeenLastCalledWith(req.params.token,action);}
  expect(m.submit).toHaveBeenCalledTimes(3);expect(origins).toEqual([origin,origin,origin]);
  expect((await page.request.get(origin+'/api/public/appointment-response/'+req.params.token)).headers()['referrer-policy']).toBe('strict-origin');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
},20000);

it('reviews the exact tutoring appointment and join action without signing in or changing it',async()=>{m.context.mockResolvedValue({row:{status:'ready',client_id:2545,guardian_user_id:1785},appt:{id:498,businessType:'tutoring',modality:'VIRTUAL',status:'scheduled',startAt:'2030-01-02T20:00:00Z',endAt:'2030-01-02T21:00:00Z'},setting:{isSchool:false},context:{learning:true,tenant:{name:'NLU QA'},brand:{name:'NLU QA',products:[]}}});req.query={action:'review'};await handler('get')(req,res);const html=res.send.mock.lastCall[0];expect(html).toContain('Appointment #498');expect(html).toContain('Finley QA');expect(html).toContain('60 minutes');expect(html).toContain('Join tutoring session');expect(html).not.toContain('<script');expect(m.submit).not.toHaveBeenCalled();});

it('renders a date of birth challenge without creating portal access on a GET', async () => {
 const service = await import('../clinicalPortalSetupEmail.service.js');
 service.readClinicalPortalSetup.mockResolvedValue({dependent:true});
 const get=router.stack.find(layer=>layer.route?.path==='/portal-setup/:token'&&layer.route.methods.get).route.stack[0].handle;
 await get(req,res);
 expect(res.send.mock.lastCall[0]).toContain('Your dependent’s date of birth');
 expect(service.completeClinicalPortalSetup).not.toHaveBeenCalled();
});

it('sends a successful same-origin verification to the standard password setup flow', async () => {
 const service = await import('../clinicalPortalSetupEmail.service.js');
 service.completeClinicalPortalSetup.mockResolvedValue('https://auricwell.com/synthetic/new_account/synthetic');
 const post=router.stack.find(layer=>layer.route?.path==='/portal-setup/:token'&&layer.route.methods.post).route.stack[0].handle;
 req.body={birthDate:'2000-01-02'};
 req.get=h=>h==='origin'?'https://auricwell.com':undefined;
 await post(req,res);
 expect(service.completeClinicalPortalSetup).toHaveBeenCalledWith(req.params.token,'2000-01-02');
 expect(res.redirect).toHaveBeenCalledWith(303,'https://auricwell.com/synthetic/new_account/synthetic');
});
