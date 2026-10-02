import {it,expect,vi,beforeEach} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());vi.mock('../../config/database.js',()=>({default:{execute}}));
import {meetingPlan,getMeetingPlan,MEETING_PLANS} from '../meetingAccessPlan.service.js';
beforeEach(()=>vi.clearAllMocks());
it('has exactly three tiers with AI Note Aid standard',()=>{expect(MEETING_PLANS.map(p=>p.name)).toEqual(['Basic','Premium','Premium Plus']);expect(MEETING_PLANS.every(p=>p.aiNoteAid)).toBe(true);expect(meetingPlan('premium')).toMatchObject({privateOffice:true,multipleOfficeGuests:false});expect(meetingPlan('premium_plus').multipleOfficeGuests).toBe(true);});
it('defaults new and unknown accounts to Basic without granting premium access',async()=>{execute.mockResolvedValue([[]]);expect((await getMeetingPlan(12)).id).toBe('basic');expect(meetingPlan('invalid').privateOffice).toBe(false);});
it('recognizes the explicit Premium Plus grant for existing accounts',async()=>{execute.mockResolvedValue([[{tier:'premium_plus',source:'existing_account_launch_grant'}]]);expect(await getMeetingPlan(12)).toMatchObject({id:'premium_plus',privateOffice:true,multipleOfficeGuests:true,grandfathered:true});});
