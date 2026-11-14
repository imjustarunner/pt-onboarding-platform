import {beforeEach, expect, it, vi} from 'vitest';
vi.mock('../providerServiceOfferings.service.js', () => ({readProviderServices: vi.fn()}));
import {readProviderServices} from '../providerServiceOfferings.service.js';
import {prepareAvailabilityServices} from '../availabilityServiceScope.service.js';
import {availabilityMatchesService, availabilityServiceType} from '../../utils/availabilityService.js';
beforeEach(() => { vi.resetAllMocks(); });
it('requires a service for new mixed openings and refuses services the provider does not offer', async () => {
  readProviderServices.mockResolvedValue({services: [{serviceType:'tutoring',offered:true},{serviceType:'counseling',offered:true}]});
  await expect(prepareAvailabilityServices(9,453,[{}])).rejects.toMatchObject({status:400});
  await expect(prepareAvailabilityServices(9,453,[{serviceType:'coaching'}])).rejects.toMatchObject({status:403});
  await expect(prepareAvailabilityServices(9,453,[{serviceType:'childcare'}])).rejects.toMatchObject({status:400});
  expect(await prepareAvailabilityServices(9,453,[{serviceType:'tutoring',careTypes:['COUPLES']}])).toEqual([{serviceType:'tutoring',careTypes:null}]);
  expect(await prepareAvailabilityServices(9,453,[{id:14}])).toEqual([{id:14,serviceType:null,careTypes:undefined}]);
});
it('preserves single-service and legacy publication paths without granting another service', async () => {
  readProviderServices.mockResolvedValue({services:[{serviceType:'coaching',offered:true}]});
  expect((await prepareAvailabilityServices(9,453,[{}]))[0].serviceType).toBe('coaching');
  await expect(prepareAvailabilityServices(9,453,[{serviceType:'counseling'}])).rejects.toMatchObject({status:403});
  readProviderServices.mockResolvedValue({services:[]});
  expect((await prepareAvailabilityServices(9,453,[{}]))[0].serviceType).toBeNull();
});
it('keeps tutoring and counseling publications separate while conservatively resolving legacy hours', () => {
  expect(availabilityMatchesService('tutoring','counseling')).toBe(false);
  expect(availabilityMatchesService(null,'tutoring')).toBe(false);
  expect(availabilityMatchesService(null,'tutoring','tutoring')).toBe(true);
  expect(availabilityMatchesService('counseling',null)).toBe(true);
  expect(availabilityServiceType(' TUTORING ')).toBe('tutoring');
});
