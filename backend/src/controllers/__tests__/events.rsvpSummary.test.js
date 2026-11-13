import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../services/vonage.service.js',()=>({default:{}}));
vi.mock('../../services/staffPollReview.service.js',()=>({reviewedPollResponses:vi.fn(async()=>[]),reviewedPollSummary:vi.fn(async()=>[{key:'1',label:'Friday',total:4}]),reviewPollResponse:vi.fn()}));
import pool from '../../config/database.js';
import { reviewedPollSummary } from '../../services/staffPollReview.service.js';
import { listCompanyEventResponses } from '../companyEvents.controller.js';
let event, rows;
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();event={id:353,agency_id:2,event_type:'company_event',organization_id:null,voting_config_json:{enabled:false}};
  rows=[{id:1,user_id:5,first_name:'Demo',last_name:'Invitee',response_key:'yes',response_label:'Yes',source:'sms'}];
  pool.execute.mockImplementation(async sql=>{
    if(sql.includes('FROM company_events'))return [[event]];
    if(sql.includes('FROM company_event_responses'))return [rows];
    if(sql.includes('FROM company_event_coordinators'))return [[]];
    throw Error(sql);
  });
});
async function invoke(){const response=res(),next=vi.fn();await listCompanyEventResponses({params:{id:'2',eventId:'353'},user:{id:7,role:'super_admin'}},response,next);expect(next).not.toHaveBeenCalled();return response.json.mock.calls[0][0];}
describe('ordinary event RSVP totals',()=>{
  it('counts the SMS Yes that appears in the response rows',async()=>{
    const data=await invoke();expect(data.responses).toMatchObject([{responseKey:'yes',source:'sms'}]);
    expect(data.summary).toEqual([{key:'yes',label:'Yes',total:1},{key:'no',label:'No',total:0},{key:'maybe',label:'Maybe',total:0}]);
    expect(reviewedPollSummary).not.toHaveBeenCalled();
  });
  it('normalizes historical RSVP spellings without classifying a custom answer as an RSVP',async()=>{
    rows=['yes','Y','YES','1','no','N','2','maybe','M','3'].map((key,index)=>({user_id:index+1,response_key:key}));
    rows.push({user_id:20,response_key:'1',response_label:'Friday'});
    expect((await invoke()).summary.map(item=>item.total)).toEqual([4,3,3]);
  });
  it('leaves custom team poll counts under the existing reviewed vote policy',async()=>{
    event={...event,event_type:'team_poll',voting_config_json:{enabled:true,options:[{key:'1',label:'Friday'},{key:'2',label:'Saturday'}]}};
    expect((await invoke()).summary).toEqual([{key:'1',label:'Friday',total:4}]);expect(reviewedPollSummary).toHaveBeenCalled();
  });
  it('preserves legacy custom votes attached directly to an event',async()=>{
    event.rsvp_mode='custom_vote';expect((await invoke()).summary).toEqual([{key:'1',label:'Friday',total:4}]);
    expect(reviewedPollSummary).toHaveBeenCalled();
  });
});
