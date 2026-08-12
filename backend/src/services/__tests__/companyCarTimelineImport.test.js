import { describe, it, expect } from 'vitest';
import CompanyCarTimelineImportService from '../../services/companyCarTimelineImport.service.js';
import { inferTripClassification } from '../../services/companyCarReasonInference.service.js';
import { chainOdometerForNewTrips } from '../../services/companyCarOdometerChain.service.js';

describe('CompanyCarTimelineImportService', () => {
  it('parses semanticSegments driving activities', () => {
    const json = {
      semanticSegments: [
        {
          startTime: '2026-01-20T08:00:00.000-07:00',
          endTime: '2026-01-20T08:30:00.000-07:00',
          visit: {
            topCandidate: {
              semanticType: 'HOME',
              placeLocation: { latLng: '38.9°, -104.8°' }
            }
          }
        },
        {
          startTime: '2026-01-20T08:35:00.000-07:00',
          endTime: '2026-01-20T09:00:00.000-07:00',
          activity: {
            distanceMeters: 16093.44,
            start: { latLng: '38.9°, -104.8°' },
            end: { latLng: '39.0°, -104.7°' },
            topCandidate: { type: 'in passenger vehicle', probability: 0.99 }
          }
        },
        {
          startTime: '2026-01-20T09:05:00.000-07:00',
          endTime: '2026-01-20T10:00:00.000-07:00',
          visit: {
            topCandidate: {
              semanticType: 'WORK',
              placeLocation: { latLng: '39.0°, -104.7°' }
            }
          }
        }
      ]
    };

    const parsed = CompanyCarTimelineImportService.parseJson(JSON.stringify(json));
    expect(parsed.format).toBe('semanticSegments');
    expect(parsed.candidates.length).toBe(1);
    expect(parsed.candidates[0].driveDate).toBe('2026-01-20');
    expect(parsed.candidates[0].miles).toBe(10);
  });

  it('filters by fromDate', () => {
    const candidates = [
      { driveDate: '2026-01-18', miles: 5 },
      { driveDate: '2026-01-20', miles: 8 }
    ];
    const filtered = CompanyCarTimelineImportService.filterCandidates(candidates, { fromDate: '2026-01-19' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].driveDate).toBe('2026-01-20');
  });
});

describe('companyCarReasonInference', () => {
  it('uses Masters home office before April 2026', () => {
    const result = inferTripClassification({
      origin: 'Masters office',
      destination: 'Denver High School',
      driveDate: '2026-03-15'
    });
    expect(result.isWork).toBe(true);
    expect(result.reasonForTravel).toMatch(/school/i);
  });

  it('uses Larkspur home office from April 2026', () => {
    const result = inferTripClassification({
      origin: 'Larkspur',
      destination: 'Client home',
      driveDate: '2026-04-10'
    });
    expect(result.isWork).toBe(true);
    expect(result.homeOfficeNote).toMatch(/Larkspur/);
  });

  it('marks Target-only trips as personal', () => {
    const result = inferTripClassification({
      origin: 'Home',
      destination: 'Target',
      driveDate: '2026-02-01'
    });
    expect(result.isWork).toBe(false);
    expect(result.reasonForTravel).toMatch(/personal/i);
  });
});

describe('companyCarOdometerChain', () => {
  it('chains new trip odometer readings', () => {
    const chained = chainOdometerForNewTrips({
      anchorEndOdometer: 7372.9,
      tripRows: [
        { miles: 10 },
        { miles: 5.5 }
      ]
    });
    expect(chained[0].startOdometerMiles).toBe(7372.9);
    expect(chained[0].endOdometerMiles).toBe(7382.9);
    expect(chained[1].startOdometerMiles).toBe(7382.9);
    expect(chained[1].endOdometerMiles).toBe(7388.4);
  });
});
