import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),assertUnlocked:vi.fn(),recordActivity:vi.fn(),staff:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../hireStaffAccess.service.js',()=>({assertHireStaffAccess:mocks.staff}));
vi.mock('../session.service.js',()=>({mobileSessions:{access:mocks.access,assertUnlocked:mocks.assertUnlocked,recordActivity:mocks.recordActivity}}));
import {touchSession,extendSession,startAuthenticatedMobileSession} from '../../quickViewAuth.service.js';
let session,context,deadline;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-11T16:00:00Z'));vi.clearAllMocks();deadline=new Date('2026-11-11T17:00:00Z');
 session={id:9,user_id:1,agency_id:10,mobile_device_session_id:3,credential_token_version:2,expires_at:deadline};context={device:{id:3},surface:'staff',qaAgencyIds:[450]};
 mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT * FROM quick_view_sessions')?[[session]]:[{insertId:9,affectedRows:1}]);mocks.access.mockResolvedValue(context);mocks.assertUnlocked.mockReturnValue(deadline);mocks.recordActivity.mockResolvedValue({expiresAt:new Date('2026-11-11T17:15:00Z')});
});
afterEach(()=>vi.useRealTimers());
it('validates the server activity grant on every private read, without renewing on polling',async()=>{
 const current=await touchSession('short-token');expect(current.expiresAt).toEqual(deadline);expect(mocks.assertUnlocked).toHaveBeenCalledWith(context);expect(mocks.recordActivity).not.toHaveBeenCalled();
 mocks.assertUnlocked.mockImplementation(()=>{throw Object.assign(new Error('Activity timer expired'),{status:423,code:'MOBILE_LOCKED'});});
 await expect(touchSession('short-token')).rejects.toMatchObject({status:423});expect(mocks.recordActivity).not.toHaveBeenCalled();
});
it('uses the device grant renewal for actual activity instead of the legacy ten-minute timer',async()=>{
 vi.setSystemTime(new Date('2026-11-11T16:15:00Z'));const active=await touchSession('short-token',{activity:true});expect(active.expiresAt).toEqual(new Date('2026-11-11T17:15:00Z'));expect(mocks.recordActivity).toHaveBeenCalledWith(context);expect(mocks.execute).toHaveBeenCalledWith('UPDATE quick_view_sessions SET last_activity_at=?,expires_at=? WHERE id=? AND revoked_at IS NULL',[new Date(),new Date('2026-11-11T17:15:00Z'),9]);
});
it('extends the same persisted device grant by ten minutes when explicitly requested',async()=>{
 mocks.recordActivity.mockResolvedValue({expiresAt:new Date('2026-11-11T17:10:00Z')});const extended=await extendSession('short-token',{minutes:10});expect(extended.expiresAt).toEqual(new Date('2026-11-11T17:10:00Z'));expect(mocks.recordActivity).toHaveBeenCalledWith(context,{extendMinutes:10});
});
it('keeps legacy PIN-only Quick View at ten minutes without adding mobile authority',async()=>{
 session={...session,mobile_device_session_id:null,expires_at:new Date('2026-11-11T16:05:00Z')};const active=await touchSession('legacy',{activity:true});expect(active.mobileDeviceSessionId).toBeNull();expect(active.expiresAt).toEqual(new Date('2026-11-11T16:10:00Z'));expect(mocks.access).not.toHaveBeenCalled();expect(mocks.recordActivity).not.toHaveBeenCalled();
});
it('issues a one-hour primary mobile session and honors the exact server-bounded deadline',async()=>{
 expect((await startAuthenticatedMobileSession({userId:1,agencyId:10,mobileDeviceId:3})).expiresAt).toEqual(deadline);
 const bounded=new Date('2026-11-11T16:20:00Z');expect((await startAuthenticatedMobileSession({userId:1,agencyId:10,mobileDeviceId:3,expiresAt:bounded})).expiresAt).toEqual(bounded);
});
