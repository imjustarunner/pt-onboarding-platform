import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:mock}));
import {serviceDayBounds,sameDayServiceWarnings,confirmSameDayServiceWarnings} from '../sameDayServiceWarning.service.js';
const input={agencyId:2,user:{id:10,role:'provider'},participants:[{role:'client',clientId:3}],occurrences:[{startAt:'2026-10-01T17:00:00Z'}],timeZone:'America/Denver'};
beforeEach(()=>mock.execute.mockReset());
describe('same-day service warnings',()=>{
 it('uses local service dates and DST day boundaries',()=>{
  expect(serviceDayBounds('2026-03-08T18:00:00Z','America/Denver')).toEqual({day:'2026-03-08',start:'2026-03-08 07:00:00',end:'2026-03-09 06:00:00'});
  expect(serviceDayBounds('2026-10-02T02:00:00Z','America/Denver').day).toBe('2026-10-01');
 });
 it('includes the other provider and excludes this appointment on reschedule',async()=>{
  mock.execute.mockResolvedValueOnce([[{id:3}]]).mockResolvedValueOnce([[{id:8,provider_user_id:12,provider_name:'Sam Therapist',service_code:'90837'}]]);
  const result=await sameDayServiceWarnings({...input,excludeAppointmentId:9});
  expect(result[0]).toMatchObject({providerName:'Sam Therapist',date:'2026-10-01',serviceCode:'90837'});
  expect(mock.execute.mock.calls[1][1].at(-1)).toBe(9);
  expect(mock.execute.mock.calls[1][0]).not.toContain('no_show');
 });
 it('does not disclose appointments for inaccessible clients',async()=>{
  mock.execute.mockResolvedValueOnce([[]]);
  await expect(sameDayServiceWarnings(input)).rejects.toMatchObject({status:403});
  expect(mock.execute).toHaveBeenCalledTimes(1);
 });
 it('requires an explicit acknowledgement before mutation',async()=>{
  mock.execute.mockResolvedValueOnce([[{id:3}]]).mockResolvedValueOnce([[{id:8,provider_name:'Sam'}]]);
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
  expect(await confirmSameDayServiceWarnings({user:input.user,body:{}},res,input)).toBe(false);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json.mock.calls[0][0].error.code).toBe('SAME_DAY_SERVICE_WARNING');
 });
});
