import { describe, expect, it } from 'vitest';
import { pickDefaultAgencyChoiceId } from '../peopleOpsAgencyPicker.js';

const ITSCO = { id: 2, name: 'ITSCO', slug: 'itsco', portal_url: 'itsco', organization_type: 'agency' };
const SAGE = {
  id: 8,
  name: 'Burning Sage Therapy',
  slug: 'burning-sage',
  portal_url: 'burning-sage',
  organization_type: 'agency'
};
const choices = [SAGE, ITSCO];

describe('pickDefaultAgencyChoiceId', () => {
  it('prefers the host-implied portal over alphabetical first', () => {
    expect(pickDefaultAgencyChoiceId({
      choices,
      hostSlug: 'itsco'
    })).toBe('2');
  });

  it('uses the route slug when the host does not imply a portal', () => {
    expect(pickDefaultAgencyChoiceId({
      choices,
      routeSlug: 'itsco'
    })).toBe('2');
  });

  it('uses the current agency when it is in the picker list', () => {
    expect(pickDefaultAgencyChoiceId({
      choices,
      currentAgency: ITSCO
    })).toBe('2');
  });

  it('uses the parent agency when current is a school', () => {
    expect(pickDefaultAgencyChoiceId({
      choices,
      currentAgency: {
        id: 99,
        name: 'Hogwarts',
        slug: 'hogwarts',
        organization_type: 'school',
        affiliated_agency_id: 2
      }
    })).toBe('2');
  });

  it('falls back to the first choice only when nothing else matches', () => {
    expect(pickDefaultAgencyChoiceId({ choices })).toBe('8');
  });
});
