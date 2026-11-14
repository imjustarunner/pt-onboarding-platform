import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import { getCompanyEventInvitationPreview } from '../companyEventStaffLink.controller.js';
const token='a'.repeat(48);
const event={id:353,agency_id:2,title:'Denver potluck',event_type:'company_event',staff_link_token:token,description:'Celebrate together',starts_at:null,
  operations_json:{invitedAgencyIds:[3],pageLink:{eventId:353,organizationSlug:'itsco',eventSlug:'denver-potluck-353'}},potluck_enabled:1,organizer_providing_json:'["Main dishes"]',created_by_user_id:7,private_data:'must not leak'};
const agencies=[{id:2,name:'ITSCO',slug:'itsco',logo_url:'/assets/itsco/logo.png',color_palette:'{"primary":"#527e4b"}'},{id:3,name:'Inner Strength',slug:'innerstrength'}];
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockImplementation(async sql=>sql.includes('FROM company_events')?[[event]]:[agencies]);});
async function invoke(params={id:'353',token}){const res=response(),next=vi.fn();await getCompanyEventInvitationPreview({params},res,next);expect(next).not.toHaveBeenCalled();return res;}
describe('unlisted no-login event invitation',()=>{
  it('returns current event details and both hosts without exposing people, responses or conversations',async()=>{
    const res=await invoke();const data=res.json.mock.calls[0][0];
    expect(data.event).toMatchObject({title:'Denver potluck',dateToBeDecided:true,potluckEnabled:true,organizerProviding:['Main dishes']});
    expect(data.branding.agencyName).toBe('ITSCO + Inner Strength');
    expect(data.branding).toMatchObject({hostAgencyName:'ITSCO',agencySlug:'itsco',logoUrl:'/assets/itsco/logo.png',colorPalette:{primary:'#527e4b'}});
    expect(data.agencies.map(agency=>agency.isHost)).toEqual([true,false]);
    expect(data.canonicalUrl).toBe('https://auricwell.com/conversa/events/itsco/denver-potluck-353');
    expect(JSON.stringify(data)).not.toMatch(/private_data|created_by|attendees|responses|userId|conversation|needList|mandatory/);
    expect(res.set).toHaveBeenCalledWith('X-Robots-Tag','noindex, nofollow');
    expect(pool.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  });
  it('offers the same public details on its readable address without an account',async()=>{
    const res=await invoke({organizationSlug:'itsco',eventSlug:'denver-potluck-353'});
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({event:expect.objectContaining({id:353,title:'Denver potluck'})}));
    expect(pool.execute.mock.calls[0][1]).toEqual(['itsco','denver-potluck-353']);
  });
  it.each([{id:'353',token:'invalid'},{id:'0',token}])('rejects malformed links without querying any records',async params=>{
    expect((await invoke(params)).status).toHaveBeenCalledWith(404);expect(pool.execute).not.toHaveBeenCalled();
  });
  it('does not expose an inactive or deleted event',async()=>{
    pool.execute.mockResolvedValue([[]]);expect((await invoke()).status).toHaveBeenCalledWith(404);
    expect(pool.execute.mock.calls[0][0]).toContain('is_active = 1');
  });
  it('does not turn a service program staff link into an anonymous page',async()=>{
    pool.execute.mockResolvedValue([[{...event,event_type:'skills_group'}]]);expect((await invoke()).status).toHaveBeenCalledWith(404);
  });
});
