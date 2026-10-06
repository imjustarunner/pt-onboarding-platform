import {describe,it,expect,vi} from 'vitest';
import {selectCompanyEventVote} from '../../utils/companyEventSmsVote.js';
import {deliverCompanyEventVoteReply} from '../companyEventSmsReply.service.js';
const event={id:1,smsCode:'WORKSHOP',votingConfig:{options:[{key:'Y',label:'Yes'},{key:'N',label:'No'}]}};
describe('SMS vote replies',()=>{
 it('accepts a simple Y/N reply for one event and explicit event codes',()=>{expect(selectCompanyEventVote([event],'y')).toMatchObject({event,response:'y'});expect(selectCompanyEventVote([event],'WORKSHOP N')).toMatchObject({event,response:'N'});});
 it('does not consume appointment or unrelated messages when no matching vote exists',()=>{expect(selectCompanyEventVote([],'Y')).toBeNull();expect(selectCompanyEventVote([event],'R')).toBeNull();expect(selectCompanyEventVote([event],'Please call me')).toBeNull();});
 it('requires disambiguation rather than silently assigning overlapping replies',()=>{const second={...event,id:2,smsCode:'PICNIC'};expect(selectCompanyEventVote([event,second],'Y')).toEqual({ambiguous:true,codes:['WORKSHOP','PICNIC']});expect(selectCompanyEventVote([event,second],'PICNIC N').event.id).toBe(2);});
 it('supports numbered choices and full custom labels',()=>{const poll={...event,votingConfig:{options:[{key:'1',label:'Tuesday afternoon'}]}};expect(selectCompanyEventVote([poll],'1').response).toBe('1');expect(selectCompanyEventVote([poll],'Tuesday afternoon').response).toBe('Tuesday afternoon');});
 it('sends a real confirmation through the guarded transport with tenant/purpose context',async()=>{const send=vi.fn();expect(await deliverCompanyEventVoteReply({result:{handled:true,agencyId:4,responseMessage:'Recorded: Yes'},from:'+13035550101',to:'+13035550100',send})).toBe(true);expect(send).toHaveBeenCalledWith({purpose:'polling',agencyId:4,from:'+13035550100',to:'+13035550101',body:'Recorded: Yes'});});
 it('cannot send a response without agency scope',async()=>{const send=vi.fn();expect(await deliverCompanyEventVoteReply({result:{handled:true,responseMessage:'No'},send})).toBe(false);expect(send).not.toHaveBeenCalled();});
});
