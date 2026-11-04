import {beforeEach,it,expect,vi} from 'vitest';
import {JSDOM} from '../../../../frontend/node_modules/jsdom/lib/api.js';
const m=vi.hoisted(()=>({context:vi.fn(),submit:vi.fn()}));
vi.mock('../appointmentEmailActions.service.js',()=>({appointmentEmailActionContext:m.context,submitAppointmentEmailAction:m.submit,appointmentEmailActions:school=>school?['cancel']:['confirm','cancel','reschedule'],actionLabels:{confirm:'Confirm',cancel:'Cancel',reschedule:'New time'}}));
vi.mock('../appointmentServiceSetting.service.js',()=>({formatAppointmentTime:()=> 'Wednesday, 2 PM'}));
import router from '../../routes/publicAppointmentResponse.routes.js';
const handler=method=>router.stack.find(l=>l.route?.methods[method]).route.stack[0].handle;
let res,req;
beforeEach(()=>{
 vi.resetAllMocks();res={set:vi.fn().mockReturnThis(),type:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn(),redirect:vi.fn()};
 req={params:{token:'a'.repeat(64)},query:{action:'cancel'},baseUrl:'/api/public/appointment-response',body:{},get:h=>h==='host'?'portal.example.test':undefined};
 m.context.mockResolvedValue({row:{status:'ready'},appt:{},setting:{isSchool:false},context:{tenant:{name:'ITSCO'},brand:{name:'ITSCO',displayName:'AuricWell Portal',clinical:true,products:[],replyTo:'support@itsco.health'}}});
});
it('GET renders a review form without applying a response, including email-link prefetch',async()=>{
 await handler('get')(req,res);expect(res.send.mock.calls[0][0]).toContain('method="post"');expect(res.send.mock.calls[0][0]).toContain('name="action" value="cancel"');expect(res.send.mock.calls[0][0]).not.toContain('<script');expect(m.submit).not.toHaveBeenCalled();
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
