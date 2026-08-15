import { describe, expect, it } from 'vitest';
import {
  copyAddressInto,
  copyShareableFields,
  guardianHasAddress,
  isHouseholdShareableField,
  isPrimaryAddressField
} from '../intakeSameAsMe.js';

describe('intakeSameAsMe', () => {
  it('treats client street as the primary address field', () => {
    expect(isPrimaryAddressField({ key: 'client_street' })).toBe(true);
    expect(isPrimaryAddressField({ key: 'address_zip' })).toBe(false);
  });

  it('copies guardian home address onto child address fields', () => {
    const child = {};
    const ok = copyAddressInto(
      child,
      { home_street: '123 Main', home_apt: '4B', home_city: 'Pueblo', home_state: 'CO', home_zip: '81001' },
      [
        { key: 'address_street' },
        { key: 'address_apt' },
        { key: 'address_city' },
        { key: 'address_state' },
        { key: 'address_zip' }
      ]
    );
    expect(ok).toBe(true);
    expect(child).toEqual({
      address_street: '123 Main',
      address_apt: '4B',
      address_city: 'Pueblo',
      address_state: 'CO',
      address_zip: '81001'
    });
  });

  it('copies household fields from a sibling and skips clinical items', () => {
    expect(isHouseholdShareableField({ key: 'physical_abuse' })).toBe(false);
    expect(isHouseholdShareableField({ key: 'emergency_contact' })).toBe(true);
    const dest = {};
    copyShareableFields(
      dest,
      { address_street: '9 Pine', emergency_contact: 'Aunt May', child_grade: '3' },
      [{ key: 'address_street' }, { key: 'emergency_contact' }, { key: 'child_grade' }]
    );
    expect(dest.address_street).toBe('9 Pine');
    expect(dest.emergency_contact).toBe('Aunt May');
    expect(dest.child_grade).toBeUndefined();
  });

  it('knows when the parent listed an address', () => {
    expect(guardianHasAddress({ guardian_address: '1 Oak' })).toBe(true);
    expect(guardianHasAddress({ phone: '555' })).toBe(false);
  });
});
