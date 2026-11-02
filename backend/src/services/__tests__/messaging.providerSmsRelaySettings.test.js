import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/UserPreferences.model.js', () => ({ default: { findByUserId: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/UserCallSettings.model.js', () => ({ default: { getByUserId: vi.fn() } }));
vi.mock('../../models/PhoneNumber.model.js', () => ({ default: { findById: vi.fn(), listByAgency: vi.fn() } }));
vi.mock('../../models/PhoneNumberAssignment.model.js', () => ({ default: { listEligibleUserIdsForNumber: vi.fn() } }));
vi.mock('../sharedCareNumber.service.js', () => ({ sharedCareNumberId: vi.fn() }));
vi.mock('../communicationRouting.service.js', () => ({ resolveClientCaregivers: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), recordSmsPermission: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Prefs from '../../models/UserPreferences.model.js';
import Calls from '../../models/UserCallSettings.model.js';
import Numbers from '../../models/PhoneNumber.model.js';
import Assignments from '../../models/PhoneNumberAssignment.model.js';
import { sharedCareNumberId } from '../sharedCareNumber.service.js';
import { resolveClientCaregivers } from '../communicationRouting.service.js';
import { getSmsSender, recordSmsPermission } from '../smsCompliance.service.js';
import { saveRelaySettings, relayEnrollmentReady, assertRelaySettingsActor } from '../providerSmsRelaySettings.service.js';
const user = { id:1433, role:'provider', is_active:1, personal_phone:'+17192172227' };
const enrollment = { provider_user_id:1433, agency_id:450, number_id:6, phone:user.personal_phone, enabled:1 };
const save = { actor:{id:1,role:'super_admin'}, userId:1433, agencyId:450, enabled:true, phone:user.personal_phone, numberId:6, consent:true };
let otherUsers, owners;
beforeEach(() => {
  vi.resetAllMocks(); otherUsers=[]; owners=[{provider_user_id:1433,agency_id:450}];
  pool.execute.mockImplementation(async sql => {
    if(sql.includes('JOIN user_agencies')) return [[user]];
    if(sql.startsWith('SELECT id, phone_number')) return [otherUsers];
    if(sql.startsWith('SELECT provider_user_id')) return [owners];
    if(sql.startsWith('SELECT id, number_id')) return [[]];
    return [{affectedRows:1}];
  });
  User.findById.mockResolvedValue(user);
  Prefs.findByUserId.mockResolvedValue({sms_enabled:1,sms_forwarding_enabled:1});
  Calls.getByUserId.mockResolvedValue({sms_inbound_enabled:1,sms_outbound_enabled:1});
  Numbers.findById.mockResolvedValue({id:6,agency_id:450,is_active:1,status:'active',number_purpose:'clinical_care',phone_number:'+17196775413'});
  Numbers.listByAgency.mockResolvedValue([]);
  Assignments.listEligibleUserIdsForNumber.mockResolvedValue([1433]);
  sharedCareNumberId.mockResolvedValue(5);
  resolveClientCaregivers.mockResolvedValue({caregiverIds:[1433]});
  getSmsSender.mockResolvedValue({scope:'campaign:450',registration:{provider:'notifyre'}});
});
it('requires actual permission and rejects another account or reserved phone', async () => {
  await expect(saveRelaySettings({...save,consent:false})).rejects.toMatchObject({status:400});
  otherUsers=[{personal_phone:'719-217-2227'}];
  await expect(saveRelaySettings(save)).rejects.toMatchObject({status:409});
  otherUsers=[]; owners=[{provider_user_id:99,agency_id:450}];
  await expect(saveRelaySettings(save)).rejects.toMatchObject({status:409});
  expect(recordSmsPermission).not.toHaveBeenCalled(); expect(User.update).not.toHaveBeenCalled();
});
it('records administrator permission and enables only after preferences are saved', async () => {
  await saveRelaySettings(save);
  expect(recordSmsPermission).toHaveBeenCalledWith(expect.objectContaining({purpose:'care',status:'opted_in',evidence:expect.objectContaining({source:'admin_recorded_verbal_consent',actorUserId:1,providerUserId:1433})}));
  expect(User.update).toHaveBeenCalledWith(1433,{personalPhone:user.personal_phone});
  expect(Prefs.update).toHaveBeenCalledWith(1433,{sms_enabled:true,sms_forwarding_enabled:true});
  const index=pool.execute.mock.calls.findIndex(([sql])=>sql.includes('SET enabled=TRUE'));
  expect(pool.execute.mock.invocationCallOrder[index]).toBeGreaterThan(Prefs.update.mock.invocationCallOrder[0]);
});
it('leaves forwarding disabled if saving preferences fails', async () => {
  Prefs.update.mockRejectedValue(new Error('storage unavailable'));
  await expect(saveRelaySettings(save)).rejects.toThrow('storage unavailable');
  expect(pool.execute.mock.calls.some(([sql])=>sql.includes('SET enabled=FALSE'))).toBe(true);
  expect(pool.execute.mock.calls.some(([sql])=>sql.includes('SET enabled=TRUE'))).toBe(false);
});
it('disables only this tenant enrollment without changing phone or consent', async () => {
  await saveRelaySettings({...save,enabled:false});
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SET enabled=FALSE WHERE agency_id=? AND provider_user_id=?'),[450,1433]);
  expect(User.update).not.toHaveBeenCalled(); expect(recordSmsPermission).not.toHaveBeenCalled();
});
it('enforces self/admin actor permissions and active agency membership', async () => {
  await expect(assertRelaySettingsActor({id:99,role:'provider'},1433,450)).rejects.toMatchObject({status:403});
  pool.execute.mockResolvedValue([[]]);
  await expect(assertRelaySettingsActor(save.actor,1433,450)).rejects.toMatchObject({status:403});
});
it('rechecks texting, forwarding, personal phone, number and current care assignment', async () => {
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(true);
  expect(await relayEnrollmentReady({...enrollment,phone:'+12025550100'},2271)).toBe(false);
  Prefs.findByUserId.mockResolvedValueOnce({sms_enabled:0,sms_forwarding_enabled:1});
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(false);
  Prefs.findByUserId.mockResolvedValueOnce({sms_enabled:1,sms_forwarding_enabled:0});
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(false);
  Calls.getByUserId.mockResolvedValueOnce({sms_outbound_enabled:0});
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(false);
  Numbers.findById.mockResolvedValueOnce({id:6,agency_id:377,is_active:1,status:'active',number_purpose:'clinical_care'});
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(false);
  resolveClientCaregivers.mockResolvedValue({caregiverIds:[]});
  expect(await relayEnrollmentReady(enrollment,2271)).toBe(false);
});
