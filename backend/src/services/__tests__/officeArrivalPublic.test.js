import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),ack:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../officeArrivalNotifications.service.js',()=>({acknowledgeArrival:m.ack,tokenHash:()=> 'hash',escapeHtml:v=>v}));
import router from '../../routes/officeArrivalPublic.routes.js';
const handle=router.stack.find(r=>r.route).route.stack[0].handle;
let req,res,next;
beforeEach(()=>{vi.resetAllMocks();req={method:'GET',params:{token:'a'.repeat(64)},baseUrl:'/api/public/office-arrivals'};res={set:vi.fn(),send:vi.fn(),status:vi.fn(),sendStatus:vi.fn()};res.status.mockReturnValue(res);m.execute.mockResolvedValue([[{notification_id:12,user_id:7}]]);next=vi.fn();});
it('email scanners and opening the preference page cannot dismiss or opt out',async()=>{
 await handle(req,res,next);expect(m.ack).not.toHaveBeenCalled();expect(res.send).toHaveBeenCalledWith(expect.stringContaining('method="post"'));expect(res.set).toHaveBeenCalledWith(expect.objectContaining({'Referrer-Policy':'no-referrer'}));
});
it('requires a valid unexpired token before accepting the explicit preference choice',async()=>{
 req.method='POST';req.body={action:'in_app_only'};await handle(req,res,next);expect(m.ack).toHaveBeenCalledWith(12,7,true);
});
it('rejects an expired or unknown token',async()=>{m.execute.mockResolvedValue([[]]);req.method='POST';req.body={action:'in_app_only'};await handle(req,res,next);expect(res.status).toHaveBeenCalledWith(410);expect(m.ack).not.toHaveBeenCalled();});
it('rejects arbitrary preference actions',async()=>{req.method='POST';req.body={action:'disable_all'};await handle(req,res,next);expect(res.sendStatus).toHaveBeenCalledWith(400);expect(m.ack).not.toHaveBeenCalled();});
