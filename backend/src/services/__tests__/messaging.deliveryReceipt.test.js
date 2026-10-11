import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn()}));
import pool from '../../config/database.js';
import {requireConversationAccess} from '../communicationAccess.service.js';
import {getEmailDeliveryReceipt} from '../emailDeliveryReceipt.service.js';
beforeEach(()=>{vi.clearAllMocks();requireConversationAccess.mockResolvedValue({id:10});});
it('returns only the author’s outbound delivery metadata without loading a thread or marking it read',async()=>{
 pool.execute.mockResolvedValue([[{id:40,send_status:'scheduled'}]]);
 expect(await getEmailDeliveryReceipt({id:5,role:'provider'},10,40)).toEqual({id:40,send_status:'scheduled'});
 expect(requireConversationAccess).toHaveBeenCalledWith({id:5,role:'provider'},10);
 expect(pool.execute.mock.calls[0][1]).toEqual([40,10,5]);
 const sql=pool.execute.mock.calls[0][0];expect(sql).toContain('author_user_id=?');expect(sql).not.toMatch(/body|attachment|UPDATE/);
});
it('rejects inaccessible conversations before reading a message',async()=>{
 requireConversationAccess.mockRejectedValueOnce(Object.assign(Error('No access'),{status:404}));
 await expect(getEmailDeliveryReceipt({id:5},11,40)).rejects.toMatchObject({status:404});expect(pool.execute).not.toHaveBeenCalled();
});
it('does not expose another author’s message or a message belonging to a different conversation',async()=>{
 pool.execute.mockResolvedValue([[]]);await expect(getEmailDeliveryReceipt({id:5},10,99)).rejects.toMatchObject({status:404});
 expect(pool.execute.mock.calls[0][1]).toEqual([99,10,5]);
});
