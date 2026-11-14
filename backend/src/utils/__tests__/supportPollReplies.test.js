import { describe, expect, it } from 'vitest';
import { matchStaffPollReply } from '../staffPollResponses.js';
import { selectCompanyEventVote } from '../companyEventSmsVote.js';
const options=[{key:'1',label:'Friday, December 11th'},{key:'2',label:'Saturday, December 12th'},{key:'3',label:'Friday, December 18th'}];
const event={id:354,smsCode:'PARTY',votingConfig:{options}};
describe('staff poll SMS replies',()=>{
 it.each(['Saturday December 12 😊','Dec. 12th!','12','2'])('recognizes an unambiguous reply: %s', raw=>{
  expect(matchStaffPollReply(raw,options)).toMatchObject({key:'2',raw});
  expect(selectCompanyEventVote([event],raw)).toMatchObject({event,response:raw});
 });
 it('selects the matching poll when other active polls have different options',()=>{
  expect(selectCompanyEventVote([event,{id:349,smsCode:'OTHER',votingConfig:{options:[{key:'Y',label:'Today'}]}}],'Dec 12')).toMatchObject({event});
 });
 it('asks for a poll code when multiple polls match, and rejects ambiguous days and unrelated text',()=>{
  expect(selectCompanyEventVote([event,{...event,id:355,smsCode:'OTHER'}],'Dec 12')).toEqual({ambiguous:true,codes:['PARTY','OTHER']});
  expect(matchStaffPollReply('12',[...options,{key:'4',label:'January 12'}])).toBeNull();
  for(const reply of ['24','HELP','STOP','I do not want Saturday December 12'])expect(matchStaffPollReply(reply,options)).toBeNull();
 });
});
