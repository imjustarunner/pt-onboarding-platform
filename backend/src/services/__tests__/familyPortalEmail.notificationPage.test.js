import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:()=>{}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn()}));
import {familyChoicePage} from '../../routes/publicFamilyNotifications.routes.js';
import {buildFamilyNotificationInvitationEmail} from '../familyNotificationInvitationEmail.service.js';
import {FAMILY_NOTIFICATION_CATEGORIES} from '../../utils/familyNotificationChoices.js';
const brand={name:'ITSCO',clinical:true,displayName:'AuricWell Portal',replyTo:'support@itsco.health',products:[]};
const context={revision:0,recipient:{agency_name:'ITSCO',full_name:'Demo Child',client_type:'school'},choices:Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,'off']))};
it('renders six scoped choices with email-only defaults and a POST confirmation',()=>{
  const html=familyChoicePage({context,brand,path:'/api/public/family-notifications/test',preset:'all'});
  for(const label of ['Email','Text','Both','Off','Confirm my choices','No sign-in','does not activate texting'])expect(html).toContain(label);
  expect(html.match(/type="radio"/g)).toHaveLength(24);
  expect(html.match(/value="email"[^>]*checked/g)).toHaveLength(6);
  expect(html).not.toMatch(/value="(?:sms|both)"[^>]*checked/);
  expect(html).not.toContain('Enrollment follow-ups');expect(html).not.toContain('In-school sessions');
  expect(html).toContain('method="post"');expect(html).not.toContain('<script');
  expect(html).not.toContain('Demo Child');expect(html).toContain('DECH');
  expect(html).toMatch(/name="choices\[insurance\]" value="sms"[^>]*disabled/);
  expect(html).toMatch(/name="choices\[insurance\]" value="both"[^>]*disabled/);
});
it('shows the SchoolCareBridge badge only for school enrollment',()=>{
  const school=familyChoicePage({context,brand,path:'/test'});
  const office=familyChoicePage({context:{...context,recipient:{...context.recipient,client_type:'office'}},brand,path:'/test',preset:'all'});
  expect(school).toContain('data-schoolcarebridge="account-updates"');
  expect(office).not.toContain('data-schoolcarebridge="account-updates"');
  expect(office).not.toContain('choices[school_sessions]');
});
it('preserves the scoped school opt-out in the unified appointment row until the recipient changes it',()=>{
  const html=familyChoicePage({context:{...context,choices:{...context.choices,appointments:'both',school_sessions:'off'}},brand,path:'/test'});
  expect(html).toMatch(/name="choices\[appointments\]" value="off"[^>]*checked/);
});
it('builds an account invitation with choice links, portal access, initials and explicit text readiness',()=>{
  const email=buildFamilyNotificationInvitationEmail({firstName:'Alex',agencyName:'ITSCO',client:{full_name:'Avery Bennett',client_type:'school'},url:'https://auricwell.com/test',portalUrl:'https://auricwell.com/itsco/login'});
  expect(email.html).toContain('https://auricwell.com/test?preset=all');expect(email.html).toContain('Choose individually');
  expect(email.text).toContain('AVBE');expect(email.text).not.toContain('Avery Bennett');
  expect(email.text).toContain('do not need to have logged in');expect(email.text).toContain('Texts remain off');
  expect(email.text).toContain('Email is the default for account updates');expect(email.text).toContain('Insurance-card requests are email only');
  expect(email.text).toContain('https://auricwell.com/itsco/login');expect(email.html).toContain('Forgot Password');
  expect(email.html).toContain('data-schoolcarebridge="account-updates"');
  expect(email.text).toContain('START');
  const office=buildFamilyNotificationInvitationEmail({agencyName:'ITSCO',client:{full_name:'Demo Person',client_type:'office'},url:'https://auricwell.com/test'});
  expect(office.html).not.toContain('data-schoolcarebridge="account-updates"');
});
it('does not reset existing declines merely by opening the page',()=>{
  const html=familyChoicePage({context,brand,path:'/test',portalUrl:'https://auricwell.com/itsco/login'});
  expect(html.match(/value="off"[^>]*checked/g)).toHaveLength(6);
  expect(html).toContain('https://auricwell.com/itsco/login');
});

it('keeps the school account-updates badge free of fundraising links',async()=>{
  const {buildFamilyNotificationInvitationEmail}=await import('../familyNotificationInvitationEmail.service.js');
  const result=buildFamilyNotificationInvitationEmail({firstName:'Demo',agencyName:'ITSCO',client:{full_name:'Demo Child',client_type:'school'},url:'https://auricwell.com/preferences/demo'});
  expect(result.html).toContain('SchoolCareBridge');
  expect(result.html).not.toContain('/donate');
  const {compactSchoolCareBridgeEmail}=await import('../schoolCareBridgeEmail.service.js');
  const delivered=compactSchoolCareBridgeEmail({...result,templateType:'family_notification_invitation',schoolCommunication:true});
  expect(delivered.html.match(/data-schoolcarebridge=/g)).toHaveLength(1);
  expect(delivered.html).not.toContain('/donate');expect(delivered.text).not.toContain('/donate');
});
