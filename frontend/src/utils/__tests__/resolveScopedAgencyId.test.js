import { describe, expect, it } from 'vitest';
import { findAgencyInListBySlug, pickPortalKey } from '../resolveScopedAgencyId.js';

describe('resolveScopedAgencyId helpers', () => {
  it('pickPortalKey prefers portal_url', () => {
    expect(pickPortalKey({ slug: 'foo', portal_url: 'itsco' })).toBe('itsco');
  });

  it('findAgencyInListBySlug matches slug case-insensitively', () => {
    const list = [
      { id: 2, name: 'ITSCO', slug: 'itsco', portal_url: 'itsco' },
      { id: 9, name: 'Hogwarts', slug: 'hogwarts', portal_url: 'hogwarts' }
    ];
    expect(findAgencyInListBySlug(list, 'ITSCO')?.id).toBe(2);
    expect(findAgencyInListBySlug(list, 'hogwarts')?.id).toBe(9);
    expect(findAgencyInListBySlug(list, 'missing')).toBeNull();
  });
});
