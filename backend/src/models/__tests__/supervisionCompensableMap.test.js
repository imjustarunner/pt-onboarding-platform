import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
import User from '../User.model.js';
it('does not snapshot candidates as compensated before both thresholds even with an enabled compensation flag', async () => {
 m.execute.mockResolvedValueOnce([[{ COLUMN_NAME: 'supervision_is_compensable' }]]).mockResolvedValueOnce([[
  { user_id: 1, credential: 'LPCC', supervision_is_compensable: 1, individual_hours: 30, group_hours: 10 },
  { user_id: 2, credential: 'LPCC', supervision_is_compensable: 1, individual_hours: 49, group_hours: 80 },
  { user_id: 3, credential: 'LPCC', supervision_is_compensable: 1, individual_hours: 50, group_hours: 50 },
  { user_id: 4, credential: 'BA', supervision_is_compensable: 1 },
  { user_id: 5, title: 'Counseling intern', supervision_is_compensable: 1 },
  { user_id: 6, title: 'Counselor candidate', supervision_is_compensable: 1 },
  { user_id: 7, credential: 'LPCC', supervision_is_compensable: 0, individual_hours: 100, group_hours: 100 },
  { user_id: 8, credential: 'LPCC', is_hourly_worker: 1, supervision_is_prelicensed: 1, supervision_is_compensable: 0 },
  { user_id: 9, title: 'Counseling intern', is_hourly_worker: 1 }
 ]]);
 expect(await User.getAgencySupervisionCompensableMap(2, [1,2,3,4,5,6,7,8,9])).toEqual({ 1:false, 2:false, 3:true, 4:true, 5:false, 6:false, 7:false, 8:true, 9:true });
});
