import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({context:vi.fn(),disable:vi.fn()}));
vi.mock('../schoolSessionEmailPreferences.service.js',()=>({schoolSessionEmailOptOutContext:m.context,disableSchoolSessionEmails:m.disable}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:async()=>({brand:{name:'ITSCO',displayName:'AuricWell Portal',clinical:true,products:[],replyTo:'support@itsco.health'}})}));
import router from '../../routes/publicSchoolSessionEmailPreferences.routes.js';
const handler=method=>router.stack.find(l=>l.route?.methods[method]).route.stack[0].handle;
let req,res;
beforeEach(()=>{
  vi.resetAllMocks();m.context.mockResolvedValue({agency_id:2,client_id:22,disabled_at:null});
  req={params:{token:'a'.repeat(64)},baseUrl:'/api/public/school-session-emails',body:{},get:h=>h==='host'?'auricwell.com':undefined};
  res={type:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn(),redirect:vi.fn()};
});
it('renders the exact limits and requires a deliberate POST, including link prefetch',async()=>{
  await handler('get')(req,res);const html=res.send.mock.calls[0][0];
  expect(html).toContain('method="post"');expect(html).toContain('Other children, other recipients, office appointments');
  expect(m.disable).not.toHaveBeenCalled();
});
it('rejects missing confirmation and a foreign origin without changing any preference',async()=>{
  await handler('post')(req,res);expect(res.status).toHaveBeenCalledWith(400);
  req.body={confirm:'yes'};req.get=h=>h==='origin'?'https://elsewhere.test':'auricwell.com';
  await handler('post')(req,res);expect(res.status).toHaveBeenCalledWith(403);expect(m.disable).not.toHaveBeenCalled();
});
it('applies only the token scope and shows a stable confirmation receipt',async()=>{
  req.body={confirm:'yes',clientId:999,agencyId:6};req.get=h=>h==='origin'?'https://auricwell.com':'auricwell.com';
  await handler('post')(req,res);expect(m.disable).toHaveBeenCalledWith(req.params.token);
  expect(res.redirect).toHaveBeenCalledWith(303,`${req.baseUrl}/${req.params.token}`);
  m.context.mockResolvedValue({agency_id:2,client_id:22,disabled_at:new Date()});
  await handler('get')(req,res);expect(res.send.mock.calls[0][0]).toContain('are turned off');expect(res.send.mock.calls[0][0]).not.toContain('<form');
});
