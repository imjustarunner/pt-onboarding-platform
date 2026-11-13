import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../unsolicitedOutreach.service.js',()=>({filterUnsolicitedOutreach:vi.fn(),isEstablishedOutreachSender:vi.fn()}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({decryptTicketRow:row=>({...row,question:row.question_ciphertext==='encrypted-example'?'We offer SEO services. Interested in a free audit and prices?':row.question})}));
import pool from '../../config/database.js';
import {filterUnsolicitedOutreach,isEstablishedOutreachSender} from '../unsolicitedOutreach.service.js';
import {cleanUpWebsiteSolicitations} from '../unsolicitedOutreachCleanup.service.js';
import {main} from '../../scripts/filterUnsolicitedInquiries.js';
let db;
const ticket={id:646,agency_id:2,source_email_from:'sales@vendor.test',subject:'School partnership',question_ciphertext:'encrypted-example'};
beforeEach(()=>{
 vi.clearAllMocks();pool.execute.mockResolvedValue([[ticket]]);isEstablishedOutreachSender.mockResolvedValue(false);filterUnsolicitedOutreach.mockResolvedValue({filtered:true});
 db={beginTransaction:vi.fn(),execute:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);
});
it('defaults to a bounded agency-scoped read-only dry run and does not expose message text or sender',async()=>{
 const result=await main(['--agency-id','2','--ticket-id','646']);
 expect(result).toEqual({agencyId:2,dryRun:true,scanned:1,matches:[{ticketId:646,category:'seo',action:'would_close_and_block'}]});
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("source_channel='public_web'"),[2,646,200]);
 expect(pool.getConnection).not.toHaveBeenCalled();expect(filterUnsolicitedOutreach).not.toHaveBeenCalled();
 expect(JSON.stringify(result)).not.toContain('sales@');expect(JSON.stringify(result)).not.toContain('SEO services');
});
it('closes matching public tickets, archives linked spam and resolves the notification only on explicit apply',async()=>{
 const result=await cleanUpWebsiteSolicitations({agencyId:2,ticketId:646,apply:true});
 expect(result.matches[0].action).toBe('closed_and_blocked');
 expect(filterUnsolicitedOutreach).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,fromEmail:'sales@vendor.test'}));
 expect(db.execute).toHaveBeenCalledTimes(3);expect(db.execute.mock.calls.every(([,args])=>args[0]===2&&args[1]===646)).toBe(true);
 expect(db.commit).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();
});
it('preserves known contacts and care requests even in cleanup mode',async()=>{
 isEstablishedOutreachSender.mockResolvedValue(true);
 expect((await cleanUpWebsiteSolicitations({agencyId:2,apply:true})).matches).toEqual([]);
 isEstablishedOutreachSender.mockResolvedValue(false);pool.execute.mockResolvedValue([[{...ticket,question_ciphertext:null,question:'I need therapy. I work in SEO and can provide pricing details.'}]]);
 expect((await cleanUpWebsiteSolicitations({agencyId:2,apply:true})).matches).toEqual([]);
 expect(filterUnsolicitedOutreach).not.toHaveBeenCalled();expect(pool.getConnection).not.toHaveBeenCalled();
});
it('does not close a ticket if rechecking the sender no longer suppresses it',async()=>{
 filterUnsolicitedOutreach.mockResolvedValue({filtered:false});
 expect((await cleanUpWebsiteSolicitations({agencyId:2,apply:true})).matches).toEqual([]);expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rolls back queue cleanup on failure',async()=>{
 db.execute.mockRejectedValue(new Error('update failed'));
 await expect(cleanUpWebsiteSolicitations({agencyId:2,apply:true})).rejects.toThrow('update failed');
 expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
});
it('requires an agency and rejects ambiguous CLI options',async()=>{
 await expect(main([])).rejects.toThrow('agency ID');
 await expect(main(['--agency-id','2','--apply','--dry-run'])).rejects.toThrow('Choose');
 await expect(main(['--agency-id','2','--oops'])).rejects.toThrow('Unknown option');
 expect(pool.execute).not.toHaveBeenCalled();
});
