import {it,expect} from 'vitest';
import {resolveNotificationTypePreference} from '../notificationPreferences.service.js';
it.each(['provider','admin','super_admin','staff','provider_plus'])('defaults personal arrival alerts and email on for %s',role=>{
 const pref=resolveNotificationTypePreference('kiosk_checkin',{userRole:role});
 expect(pref.effective.inApp).toBe(true);expect(pref.effective.email).toBe(true);
});
it('preserves an explicit check-in email opt-out',()=>{
 const pref=resolveNotificationTypePreference('kiosk_checkin',{userRole:'provider',typePreferences:new Map([['kiosk_checkin',{email:false,inApp:true}]])});
 expect(pref.effective.email).toBe(false);expect(pref.effective.inApp).toBe(true);
});
