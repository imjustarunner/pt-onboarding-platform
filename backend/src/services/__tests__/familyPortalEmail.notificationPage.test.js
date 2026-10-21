import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:()=>{}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn()}));
import {familyChoicePage} from '../../routes/publicFamilyNotifications.routes.js';
import {buildFamilyNotificationInvitationEmail} from '../familyNotificationInvitationEmail.service.js';
import {FAMILY_NOTIFICATION_CATEGORIES} from '../../utils/familyNotificationChoices.js';
const brand={name:'ITSCO',clinical:true,displayName:'AuricWell Portal',replyTo:'support@itsco.health',products:[]};
const context={revision:0,recipient:{agency_name:'ITSCO',full_name:'Demo Child',client_type:'school'},choices:Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,'off']))};
it('renders a scoped Email/Text/Both/Off table with a POST confirmation and no account activation',()=>{
  const html=familyChoicePage({context,brand,path:'/api/public/family-notifications/test',preset:'all'});
  for(const label of ['Email','Text','Both','Off','Confirm my choices','No sign-in','not activate texting'])expect(html).toContain(label);
  expect(html.match(/type="radio"/g)).toHaveLength(32);
  expect(html).toContain('method="post"');expect(html).not.toContain('<script');
  expect(html).not.toContain('Demo Child');expect(html).toContain('DECH');
});
it('keeps school sessions off for office enrollment even when selecting all',()=>{
  const html=familyChoicePage({context:{...context,recipient:{...context.recipient,client_type:'office'}},brand,path:'/test',preset:'all'});
  expect(html).toMatch(/name="choices\[school_sessions\]" value="both"[^>]*disabled/);
  expect(html).toMatch(/name="choices\[school_sessions\]" value="off"[^>]*checked/);
});
it('builds an account invitation with both choice links, initials and explicit text readiness',()=>{
  const email=buildFamilyNotificationInvitationEmail({firstName:'Alex',agencyName:'ITSCO',client:{full_name:'Avery Bennett'},url:'https://auricwell.com/test'});
  expect(email.html).toContain('https://auricwell.com/test?preset=all');expect(email.html).toContain('Choose individually');
  expect(email.text).toContain('AVBE');expect(email.text).not.toContain('Avery Bennett');
  expect(email.text).toContain('do not need to have logged in');expect(email.text).toContain('Texts remain off');
});
