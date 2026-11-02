import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),notify:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientExchangeNotifications.service.js',()=>({notifyExchangeClaim:m.notify}));
import {processExchangeRequestNotices} from '../clientExchangeRequestQueue.service.js';
let status;
beforeEach(()=>{vi.clearAllMocks();status='pending';m.notify.mockResolvedValue();m.execute.mockImplementation(async(sql,args)=>{if(sql.startsWith('SELECT request_id'))return [[{request_id:61}]];if(sql.includes("SET status='sending'")){const claimed=status==='pending';if(claimed)status='sending';return [{affectedRows:claimed?1:0}];}if(sql.startsWith('SELECT l.*'))return [[{id:14,agency_id:2,request_status:'pending',requesting_provider_user_id:10}]];if(sql.includes('SET status=?'))status=args[0];return [{}];});});
it('only one worker sends notifications for a durably queued request',async()=>{await Promise.all([processExchangeRequestNotices(),processExchangeRequestNotices()]);expect(m.notify).toHaveBeenCalledOnce();expect(m.notify).toHaveBeenCalledWith({listing:expect.objectContaining({id:14}),requestId:61,requestingProviderUserId:10});expect(status).toBe('completed');});
it('keeps uncertain partial notification failures for review without repeating mail',async()=>{m.notify.mockRejectedValue(new Error('partial send failed'));await processExchangeRequestNotices();expect(status).toBe('needs_review');await processExchangeRequestNotices();expect(m.notify).toHaveBeenCalledOnce();});
