import { describe, it, expect } from 'vitest';
import CompanyCarTimelineImportService from '../../services/companyCarTimelineImport.service.js';
import {
  inferTripClassification,
  buildHistoricalPatternsFromTrips
} from '../../services/companyCarReasonInference.service.js';
import { consolidateCandidatesByDay } from '../../services/companyCarTripConsolidation.service.js';
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
    expect(parsed.candidates[0].origin).toBe('Home');
    expect(parsed.candidates[0].destination).toBe('Work');
  });
});

describe('companyCarTripConsolidation', () => {
  it('merges same-day trips and sums miles', () => {
    const merged = consolidateCandidatesByDay([
      {
        driveDate: '2026-01-20',
        startTime: '2026-01-20T08:00:00Z',
        miles: 4,
        originLabel: 'Masters',
        destinationLabel: 'Windchime'
      },
      {
        driveDate: '2026-01-20',
        startTime: '2026-01-20T10:00:00Z',
        miles: 3.5,
        originLabel: 'Windchime',
        destinationLabel: 'Masters'
      }
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].miles).toBe(7.5);
    expect(merged[0].destinationsText).toContain('Masters');
    expect(merged[0].destinationsText).toContain('Windchime');
    expect(merged[0].consolidatedCount).toBe(2);
  });
});

describe('companyCarReasonInference', () => {
  it('infers Client care for masters-windchime round trip', () => {
    const result = inferTripClassification({
      destinationsText: 'Masters, 437 Windchime Place, Masters',
      driveDate: '2026-02-15'
    });
    expect(result.isWork).toBe(true);
    expect(result.reasonForTravel).toMatch(/client care/i);
  });

  it('infers Denver schools from historical-style route', () => {
    const result = inferTripClassification({
      destinationsText: 'Masters, Crest, Denver, Hamilton Middle School, Masters',
      driveDate: '2026-02-15'
    });
    expect(result.reasonForTravel).toMatch(/denver school/i);
  });

  it('matches historical patterns from DB-shaped trips', () => {
    const patterns = buildHistoricalPatternsFromTrips([
      {
        destinations_json: JSON.stringify(['Masters', 'windchime', 'masters']),
        reason_for_travel: 'Client care'
      }
    ]);
    const result = inferTripClassification({
      destinationsText: 'Masters, Windchime Office, Masters',
      driveDate: '2026-03-01',
      historicalPatterns: patterns
    });
    expect(result.reasonForTravel).toBe('Client care');
  });

  it('uses Larkspur windchime for client care after April', () => {
    const result = inferTripClassification({
      destinationsText: 'Larkspur, Windchime, Larkspur',
      driveDate: '2026-04-15'
    });
    expect(result.reasonForTravel).toMatch(/client care/i);
  });
});

describe('companyCarOdometerChain', () => {
  it('chains new trip odometer readings', () => {
    const chained = chainOdometerForNewTrips({
      anchorEndOdometer: 7372.9,
      tripRows: [{ miles: 10 }, { miles: 5.5 }]
    });
    expect(chained[1].endOdometerMiles).toBe(7388.4);
  });
});
