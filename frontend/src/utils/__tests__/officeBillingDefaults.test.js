import { expect, it } from 'vitest';
import { serviceLocationForOffice } from '../officeBillingDefaults';
it('does not choose Denver merely because it shares the office place-of-service code', () => {
  const denver = {id:1,billing_office_location_id:6,place_of_service:'11'};
  const windchime = {id:2,billing_office_location_id:1,place_of_service:'11'};
  expect(serviceLocationForOffice([denver,windchime],1,'11')).toBe(windchime);
  expect(serviceLocationForOffice([denver],1,'11')).toBeNull();
});
it('matches the agency billing identity and service type, not just the building', () => {
  const telehealth = {id:1,billingOfficeLocationId:5,placeOfService:'02'};
  const office = {id:2,billingOfficeLocationId:5,placeOfService:'11'};
  expect(serviceLocationForOffice([telehealth,office],5,'11')).toBe(office);
});
it('can fall back to an unassigned service template without borrowing another building', () => {
  const generic = {id:2,place_of_service:'11'};
  expect(serviceLocationForOffice([{id:1,billing_office_location_id:6,place_of_service:'11'},generic],5,'11')).toBe(generic);
});
