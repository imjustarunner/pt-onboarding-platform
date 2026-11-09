import {describe,it,expect} from 'vitest';
import {resolveNotificationTypePreference} from '../notificationPreferences.service.js';
import {closureEmailOptions} from '../../utils/schoolClosureDelivery.js';
const context=(mode,extra={})=>({userId:7,agencyId:2,userRole:'provider',user:{id:7,role:'provider',work_email:'provider@itsco.health',personal_email:'personal@example.test'},globalPreferences:{email_enabled:1,sms_enabled:1,push_notifications_enabled:1},legacyCategories:{staff_communications_2:{choices:{notifications:true}}},typePreferences:new Map(mode?[['school_closure_notice',{deliveryMode:mode}]]:[]),...extra});
const resolve=(mode,extra)=>resolveNotificationTypePreference('school_closure_notice',context(mode,extra));
describe('closure preference resolution',()=>{
 it('starts in app with optional push and no email/text',()=>{const p=resolve();expect(p.delivery.mode).toBe('app');expect(p.effective).toMatchObject({inApp:true,push:true,email:false,sms:false,digest:false});});
 it('None suppresses every notification channel',()=>{expect(resolve('none').effective).toMatchObject({inApp:false,push:false,email:false,sms:false,toast:false,sound:false,digest:false});});
 it('SSO exposes work email without a personal-copy choice',()=>{const p=resolve('work_email');expect(p.effective.email).toBe(true);expect(p.delivery.options.map(o=>o.value)).toEqual(['app','sms','work_email','none']);});
 it('non-SSO exposes work plus personal forwarding',()=>{const p=resolve('work_email_forward',{user:{role:'provider',work_email:'alias@itsco.health',personal_email:'personal@example.test',sso_password_override:1,login_is_group_email:1}});expect(p.effective.email).toBe(true);expect(p.delivery.options.some(o=>o.value==='work_email_forward'&&o.available)).toBe(true);expect(p.delivery.options.some(o=>o.value==='work_email')).toBe(false);});
 it('missing personal email prevents forwarding',()=>{expect(closureEmailOptions({work_email:'alias@itsco.health',sso_password_override:1}).emailAvailable).toBe(false);});
 it('text requires its master switch and recorded staff consent',()=>{expect(resolve('sms').effective.sms).toBe(true);expect(resolve('sms',{globalPreferences:{sms_enabled:0}}).effective.sms).toBe(false);expect(resolve('sms',{legacyCategories:{}}).effective.sms).toBe(false);});
 it('a global text opt-out never switches to email or app',()=>{expect(resolve('sms',{globalPreferences:{sms_enabled:0}}).effective).toMatchObject({sms:false,email:false,inApp:false});});
 it('school, guardian and athlete roles cannot receive staff closure alerts',()=>{for(const userRole of ['school_staff','client_guardian','athlete','client','kiosk'])expect(resolve('app',{userRole}).effective.inApp).toBe(false);});
 it('all-account settings recognize text consent in an active agency context',()=>{expect(resolve('sms',{agencyId:null}).delivery.options.find(o=>o.value==='sms').available).toBe(true);});
});
