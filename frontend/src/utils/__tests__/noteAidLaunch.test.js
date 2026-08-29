import { describe, expect, it } from 'vitest';
import {
  buildNoteAidQuery,
  noteAidPath,
  toDateOfService,
  treatmentPlanUpdaterQuery
} from '../noteAidLaunch.js';

describe('noteAidLaunch', () => {
  it('normalizes progress-note launch params', () => {
    const q = buildNoteAidQuery({
      clientId: 42,
      officeEventId: 9,
      dateOfService: '2026-08-25T15:00:00Z',
      serviceCode: '90837',
      launchIntent: 'progress_note'
    });
    expect(q).toEqual({
      clientId: '42',
      officeEventId: '9',
      dateOfService: '2026-08-25',
      serviceCode: '90837',
      launchIntent: 'progress_note'
    });
  });

  it('builds treatment plan updater query', () => {
    expect(treatmentPlanUpdaterQuery(7)).toEqual({
      clientId: '7',
      launchIntent: 'update_treatment_plan',
      noteAid: 'psychotherapy_plan'
    });
    expect(treatmentPlanUpdaterQuery(7, { serviceCode: 'H0004' })).toEqual({
      clientId: '7',
      launchIntent: 'update_treatment_plan',
      serviceCode: 'H0004',
      noteAid: 'h0004_plan'
    });
  });

  it('resolves org-scoped path', () => {
    expect(noteAidPath({ organizationSlug: 'itsco' })).toBe('/itsco/note-aid');
    expect(noteAidPath({})).toBe('/note-aid');
  });

  it('parses DOS from Date and strings', () => {
    expect(toDateOfService('2026-01-02')).toBe('2026-01-02');
    expect(toDateOfService(new Date('2026-03-04T12:00:00Z'))).toBe('2026-03-04');
    expect(toDateOfService('')).toBe(null);
  });
});
