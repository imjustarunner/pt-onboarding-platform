import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({context:vi.fn(),submit:vi.fn()}));
vi.mock('../appointmentEmailActions.service.js',()=>({appointmentEmailActionContext:m.context,submitAppointmentEmailAction:m.submit,appointmentEmailActions:school=>school?['absence']:['confirm','cancel','reschedule'],actionLabels:{confirm:'Confirm',cancel:'Cancel',reschedule:'New time',absence:'School absence'}}));
vi.mock('../appointmentServiceSetting.service.js',()=>({formatAppointmentTime:()=> 'Wednesday, 2 PM'}));
import router from '../../routes/publicAppointmentResponse.routes.js';
const handler=method=>router.stack.find(l=>l.route?.methods[method]).route.stack[0].handle;
let res,req;
beforeEach(()=>{
 vi.resetAllMocks();res={type:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn(),redirect:vi.fn()};
 req={params:{token:'a'.repeat(64)},query:{action:'cancel'},baseUrl:'/api/public/appointment-response',body:{},get:h=>h==='host'?'portal.example.test':undefined};
 m.context.mockResolvedValue({row:{status:'ready'},appt:{},setting:{isSchool:false},context:{tenant:{name:'ITSCO'},brand:{name:'ITSCO',displayName:'AuricWell Portal',clinical:true,products:[],replyTo:'support@itsco.health'}}});
});
it('GET renders a review form without applying a response, including email-link prefetch',async()=>{
 await handler('get')(req,res);expect(res.send.mock.calls[0][0]).toContain('method="post"');expect(res.send.mock.calls[0][0]).toContain('value="cancel" selected');expect(m.submit).not.toHaveBeenCalled();
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
