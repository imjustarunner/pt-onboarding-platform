import { describe, expect, it } from 'vitest';
import { missingSupervisorServiceDetails, parseReviewContent, supervisorMentalStatus, supervisorNoteSections, supervisorObjectiveRatings, supervisorServiceDetails } from '../supervisorNoteReview.js';

describe('supervisor note presentation', () => {
  it('collapses only explicitly normal MSE findings and preserves unknown or unassessed findings', () => {
    const result = supervisorMentalStatus({ domains: { Appearance: { status: 'normal' }, Mood: { status: 'abnormal', detail: 'Anxious' }, Judgment: { status: 'not_assessed' }, Speech: { status: 'selected', option: 'Slow' }, Memory: {} } });
    expect(result.normal.map(row => row.domain)).toEqual(['Appearance']);
    expect(result.notable.map(row => row.domain)).toEqual(['Mood', 'Judgment', 'Speech']);
    expect(supervisorMentalStatus({ domains: { Memory: {} } })).toEqual({ notable: [], normal: [] });
  });
  it('keeps conflicting abnormal findings visible even when an all-normal flag exists', () => {
    expect(supervisorMentalStatus({ allNormal: true, domains: { Mood: { status: 'abnormal' } } }).notable).toHaveLength(1);
  });
  it('keeps score zero distinct from missing history and does not fabricate earlier scores', () => {
    const [row] = supervisorObjectiveRatings([{ scaleValue: 0, scaleTarget: 7, disposition: 'rated' }]);
    expect(row.current).toBe(0); expect(row.start).toBeNull(); expect(row.recent).toBeNull();
  });
  it('presents pending service corrections for review without mutating the original snapshot', () => {
    const note = { durationMinutes: 30, effectiveServiceDetails: { durationMinutes: 40 }, pendingServiceDetails: { durationMinutes: 50 } };
    expect(supervisorServiceDetails(note).durationMinutes).toBe(50); expect(note.durationMinutes).toBe(30);
    expect(missingSupervisorServiceDetails({ durationMinutes: 0 })).toContain('duration');
  });
  it('renders plain or structured signed content without blank sections', () => {
    expect(supervisorNoteSections({ sections: { Subjective: 'Entered', Plan: '' } }).map(row => row.text)).toEqual(['Entered']);
    expect(supervisorNoteSections('Plain signed screener')[0].text).toBe('Plain signed screener');
    expect(parseReviewContent('Plain signed screener').note).toBe('Plain signed screener');
  });
});
