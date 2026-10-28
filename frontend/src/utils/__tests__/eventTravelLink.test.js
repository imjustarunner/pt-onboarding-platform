import { describe, expect, it } from 'vitest';
import { eventTravelLinkRequest } from '../../navigation/eventTravel.js';
describe('event travel links', () => {
  it('carries event/date and an optional separately reimbursed mileage claim without identity or credentials', () => {
    expect(eventTravelLinkRequest({eventTravel:'327',eventDate:'2026-10-17',mileageClaim:'193'})).toEqual({eventId:327,eventDate:'2026-10-17',existingMileageClaimId:193});
    expect(eventTravelLinkRequest({eventTravel:'229',eventDate:'2026-10-23'})).toEqual({eventId:229,eventDate:'2026-10-23',existingMileageClaimId:null});
  });
  it('ignores malformed identifiers and dates', () => {
    expect(eventTravelLinkRequest({eventTravel:'../../admin'})).toBeNull();
    expect(eventTravelLinkRequest({eventTravel:'-2'})).toBeNull();
    expect(eventTravelLinkRequest({eventTravel:'229',eventDate:'garbage',mileageClaim:'-1'})).toEqual({eventId:229,eventDate:'',existingMileageClaimId:null});
  });
});
