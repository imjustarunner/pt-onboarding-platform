import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../appointmentConflict.service.js', () => ({ appointmentOccupiesTime: s => !['draft','voided'].includes(s), withAppointmentWindow: vi.fn(async (_pool,_row,_id,save) => save()) }));
import Appointment from '../../models/Appointment.model.js';
import pool from '../../config/database.js';
import { withAppointmentWindow } from '../appointmentConflict.service.js';
const source = { id: 1, providerUserId: 9, startAt: '2030-01-01 17:00:00', endAt: '2030-01-01 18:00:00', status:'scheduled' };
beforeEach(() => vi.restoreAllMocks());
it('routes new appointment writes through the conflict guard',async()=>{
 const saved=vi.spyOn(Appointment,'createInAvailableWindow').mockResolvedValue({id:1});
 await Appointment.create(source);expect(withAppointmentWindow).toHaveBeenCalledWith(pool,source,null,expect.any(Function));expect(saved).toHaveBeenCalledWith(source);
});
it('rejects a stale edit before writing over a concurrent move',async()=>{
 vi.spyOn(Appointment,'findById').mockResolvedValueOnce(source).mockResolvedValueOnce({...source,startAt:'2030-01-02 17:00:00'});
 await expect(Appointment.update(1,{startAt:'2030-01-03 17:00:00'})).rejects.toMatchObject({status:409});expect(pool.execute).not.toHaveBeenCalled();
});
