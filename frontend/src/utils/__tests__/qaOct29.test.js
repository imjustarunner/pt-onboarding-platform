import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setRememberedLogin, setRememberedGoogleLogin, setRememberedSchoolStaffPasswordLogin, getRememberedLogin, getRememberedSchoolStaffPasswordLogin, getPortalLoginMemory, setPendingLoginRoute, consumePendingLoginRoute } from '../loginRemember';
import { formatAuditTimestamp } from '../formatDate';
import { useUserPreferencesStore } from '../../store/userPreferences';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setActivePinia(createPinia());});
it('keeps the shared QA login blank even with legacy remembered family, provider or school shortcuts',()=>{
 const account={username:'previous@example.test',orgSlug:'auricwell-qa-demo'};
 setRememberedLogin(account);setRememberedGoogleLogin(account);
 expect(getPortalLoginMemory(account.orgSlug)).toEqual({username:'',remembered:false,google:null});
 expect(getRememberedLogin()).toBeNull();
 setRememberedSchoolStaffPasswordLogin({...account,orgSlug:'auricwell-qa-demo-school'});
 expect(getRememberedSchoolStaffPasswordLogin()).toBeNull();
 setRememberedLogin({...account,orgSlug:'itsco'});expect(getPortalLoginMemory('itsco').username).toBe(account.username);
});
it('consumes a valid routing handoff once and clears the old unscoped username',()=>{
 sessionStorage.setItem('__pt_login_pending_username__','old@example.test');
 setPendingLoginRoute({username:'current@example.test',path:'/schoolcarebridge/app/demo'});
 expect(consumePendingLoginRoute('/schoolcarebridge/app/demo').username).toBe('current@example.test');
 expect(consumePendingLoginRoute('/schoolcarebridge/app/demo')).toBeNull();
 expect(sessionStorage.getItem('__pt_login_pending_username__')).toBeNull();
});
it('rejects a handoff for a different portal or an expired handoff',()=>{
 setPendingLoginRoute({username:'current@example.test',path:'/school/login'});
 expect(consumePendingLoginRoute('/agency/login')).toBeNull();
 setPendingLoginRoute({username:'current@example.test',path:'/school/login'});
 const spy=vi.spyOn(Date,'now').mockReturnValue(Date.now()+300001);
 expect(consumePendingLoginRoute('/school/login')).toBeNull();spy.mockRestore();
});
it('uses Denver daylight saving time for audit instants even on a Pacific browser',()=>{
 expect(formatAuditTimestamp('2026-10-29T13:36:00Z')).toContain('7:36 AM MDT');
 expect(formatAuditTimestamp('2026-11-05 14:36:00')).toContain('7:36 AM MST');
 useUserPreferencesStore().timezone='America/New_York';
 expect(formatAuditTimestamp('2026-10-29T13:36:00Z')).toContain('9:36 AM EDT');
});
it('does not turn a calendar date into the prior evening',()=>{
 expect(formatAuditTimestamp('2026-10-29')).toBe('Oct 29, 2026');
 expect(formatAuditTimestamp('2026-10-29T00:00:00Z',{dateOnly:true})).toBe('Oct 29, 2026');
 expect(formatAuditTimestamp('invalid')).toBe('');
});
