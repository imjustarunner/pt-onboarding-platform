import { describe, it, expect } from 'vitest';
import {
  milesWithinTolerance,
  findBestHistoricalMatch,
  matchConsolidatedCandidate,
  isDuplicateExistingTrip,
  isCoordinateLabel,
  MATCH_TOLERANCE
} from '../../services/companyCarHistoricalMatch.service.js';
import { consolidateCandidatesByDay } from '../../services/companyCarTripConsolidation.service.js';

describe('companyCarHistoricalMatch', () => {
  it('matches miles within 0.7 tolerance to training example', () => {
    const match = findBestHistoricalMatch({
      miles: 13.9,
      labelTokens: [],
      dbTrips: []
    });
    expect(match).toBeTruthy();
    expect(match.reason).toBe('Office clients');
    expect(match.score).toBeGreaterThanOrEqual(MATCH_TOLERANCE);
  });

  it('does not match when miles differ beyond tolerance', () => {
    const match = findBestHistoricalMatch({
      miles: 25,
      labelTokens: [],
      dbTrips: []
    });
    expect(match).toBeNull();
  });

  it('fills destinations and reason only when matched', () => {
    const result = matchConsolidatedCandidate({ driveDate: '2026-01-18', miles: 13.9 }, []);
    expect(result.matched).toBe(true);
    expect(result.include).toBe(true);
    expect(result.reasonForTravel).toBe('Office clients');
    expect(result.destinationsText).toContain('Windchime');

    const blank = matchConsolidatedCandidate({ driveDate: '2026-02-01', miles: 42 }, []);
    expect(blank.matched).toBe(false);
    expect(blank.include).toBe(false);
    expect(blank.reasonForTravel).toBe('');
    expect(blank.destinationsText).toBe('');
  });

  it('detects duplicate existing trips by date and miles', () => {
    const dup = isDuplicateExistingTrip(
      [{ drive_date: '2026-01-18', miles: 13.9 }],
      '2026-01-18',
      14.2
    );
    expect(dup).toBe(true);
    expect(milesWithinTolerance(13.9, 14.2)).toBe(true);
  });

  it('derives miles from odometer when stored miles is zero', () => {
    const match = findBestHistoricalMatch({
      miles: 14,
      labelTokens: [],
      dbTrips: [{
        destinations_json: JSON.stringify(['Masters', 'windchime', 'masters']),
        reason_for_travel: 'Client care',
        miles: 0,
        start_odometer_miles: 6058,
        end_odometer_miles: 6072
      }]
    });
    expect(match).toBeTruthy();
    expect(match.reason).toBe('Client care');
    expect(match.miles).toBe(14);
  });

  it('skips coordinate labels', () => {
    expect(isCoordinateLabel('38.91234, -104.81234')).toBe(true);
    expect(isCoordinateLabel('Masters')).toBe(false);
  });
});

describe('companyCarTripConsolidation', () => {
  it('merges same-day miles without coordinate labels', () => {
    const merged = consolidateCandidatesByDay([
      {
        driveDate: '2026-01-20',
        miles: 4,
        originLabel: '38.90000, -104.80000',
        destinationLabel: 'Masters'
      },
      {
        driveDate: '2026-01-20',
        miles: 3,
        originLabel: 'Masters',
        destinationLabel: '38.95000, -104.75000'
      }
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].miles).toBe(7);
    expect(merged[0].destinationsText).toBe('Masters');
  });
});
