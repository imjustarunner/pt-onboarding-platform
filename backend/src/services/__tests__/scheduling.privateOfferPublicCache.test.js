import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../providerAvailability.service.js',()=>({default:{computeWeekAvailability:vi.fn()}}));
vi.mock('../publicReadSnapshot.service.js',()=>({readPublicSnapshot:vi.fn()}));
vi.mock('../privateReplacementSlots.service.js',()=>({readPrivateReplacementSlots:vi.fn()}));
import Availability from '../providerAvailability.service.js';
import {readPublicSnapshot} from '../publicReadSnapshot.service.js';
import {readPrivateReplacementSlots} from '../privateReplacementSlots.service.js';
import {readPublicWeekAvailability} from '../publicAvailabilitySnapshot.service.js';
const options={agencyId:2,providerId:5,weekStartYmd:'2030-01-01'};
const slot={startAt:'2030-01-03T17:00:00Z',endAt:'2030-01-03T18:00:00Z',roomId:7,privateClientName:'Never public'};
beforeEach(()=>{vi.clearAllMocks();let cached;readPublicSnapshot.mockImplementation(async(_,build)=>cached ||= await build());Availability.computeWeekAvailability.mockResolvedValue({inPersonSlots:[slot],virtualSlots:[slot],busyBlocks:[{privateName:'Never public'}]});readPrivateReplacementSlots.mockResolvedValue([]);});
it('hides a newly offered time even when the public snapshot was built before the offer',async()=>{
  expect((await readPublicWeekAvailability(options)).inPersonSlots).toHaveLength(1);
  readPrivateReplacementSlots.mockResolvedValue([{start_at:'2030-01-03 17:00:00',end_at:'2030-01-03 18:00:00'}]);
  const result=await readPublicWeekAvailability(options);expect(result.inPersonSlots).toEqual([]);expect(result.virtualSlots).toEqual([]);expect(Availability.computeWeekAvailability).toHaveBeenCalledTimes(1);
});
it('restores the cached base opening as soon as the offer expires or is released',async()=>{
  readPrivateReplacementSlots.mockResolvedValue([{start_at:'2030-01-03 17:00:00',end_at:'2030-01-03 18:00:00'}]);expect((await readPublicWeekAvailability(options)).virtualSlots).toEqual([]);
  readPrivateReplacementSlots.mockResolvedValue([]);expect((await readPublicWeekAvailability(options)).virtualSlots).toHaveLength(1);expect(Availability.computeWeekAvailability).toHaveBeenCalledTimes(1);
  expect(Availability.computeWeekAvailability).toHaveBeenCalledWith(expect.objectContaining({includePrivateOffers:true}));
});
it('never exposes the private calendar or recipient information in public results',async()=>{
  const result=await readPublicWeekAvailability(options);expect(JSON.stringify(result)).not.toContain('Never public');expect(result).not.toHaveProperty('busyBlocks');
});
