import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../providerAvailability.service.js', () => ({default:{computeWeekAvailability:vi.fn()}}));
vi.mock('../publicReadSnapshot.service.js', () => ({readPublicSnapshot:vi.fn()}));
import Availability from '../providerAvailability.service.js';
import {readPublicSnapshot} from '../publicReadSnapshot.service.js';
import {readPublicWeekAvailability} from '../publicAvailabilitySnapshot.service.js';
const options={agencyId:2,providerId:9,weekStartYmd:'2030-01-09',intakeOnly:true};
beforeEach(()=>vi.resetAllMocks());
describe('public availability snapshot boundary',()=>{
 it('normalizes a week for reuse across formats and exposes only public slot fields',async()=>{
  readPublicSnapshot.mockImplementation((_key,load)=>load());
  Availability.computeWeekAvailability.mockResolvedValue({timeZone:'UTC',busy:[{clientName:'Private'}],virtualSlots:[{startAt:'2030-01-09T09:00:00Z',endAt:'2030-01-09T10:00:00Z',clientName:'Private'}]});
  const result=await readPublicWeekAvailability(options);
  expect(readPublicSnapshot.mock.calls[0][0]).toMatchObject({providerId:9,kind:'availability'});
  expect(Availability.computeWeekAvailability).toHaveBeenCalledWith(expect.objectContaining({weekStartYmd:'2030-01-07'}));
  expect(JSON.stringify(result)).not.toContain('Private');expect(result).not.toHaveProperty('busy');
 });
 it('live hold validation always bypasses a cached opening and sees the current closed schedule',async()=>{
  readPublicSnapshot.mockResolvedValue({virtualSlots:[{startAt:'2030-01-09T09:00:00Z'}]});
  Availability.computeWeekAvailability.mockResolvedValue({virtualSlots:[],inPersonSlots:[]});
  expect((await readPublicWeekAvailability(options)).virtualSlots).toHaveLength(1);
  expect((await readPublicWeekAvailability(options,{fresh:true})).virtualSlots).toHaveLength(0);
  expect(readPublicSnapshot).toHaveBeenCalledTimes(1);expect(Availability.computeWeekAvailability).toHaveBeenCalledTimes(1);
 });
});
