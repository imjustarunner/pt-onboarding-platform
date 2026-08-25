import { describe, expect, it } from 'vitest';
import {
  clientDisplayName,
  clientTenantLabel,
  initialsLikelyMatch,
  normalizeInitialsKey,
  normalizeNoteAidClientRow
} from '../noteAidTreatmentHelpers.js';

describe('Note Aid multi-tenant client helpers', () => {
  it('prefers full_name for display', () => {
    expect(
      clientDisplayName({ full_name: 'Alex Morgan', first_name: 'A', last_name: 'M', initials: 'AM' })
    ).toBe('Alex Morgan');
  });

  it('normalizes tenant label from row or lookup', () => {
    expect(clientTenantLabel({ agency_name: 'ITSCO' })).toBe('ITSCO');
    expect(clientTenantLabel({ agency_id: 2 }, { 2: 'PlotTwist' })).toBe('PlotTwist');
  });

  it('normalizes client rows for pickers', () => {
    const row = normalizeNoteAidClientRow(
      { id: 10, agency_id: 2, full_name: 'Jordan Lee', initials: 'JL' },
      { 2: 'Acme Clinic' }
    );
    expect(row.clientId).toBe(10);
    expect(row.agencyId).toBe(2);
    expect(row.agency_name).toBe('Acme Clinic');
    expect(row.full_name).toBe('Jordan Lee');
  });

  it('matches initials fuzzily without auto-linking', () => {
    expect(normalizeInitialsKey('a.m.')).toBe('AM');
    expect(initialsLikelyMatch('AM', { initials: 'A.M.' })).toBe(true);
    expect(initialsLikelyMatch('AMM', { initials: 'AM' })).toBe(true);
    expect(initialsLikelyMatch('XY', { initials: 'AM' })).toBe(false);
  });
});
