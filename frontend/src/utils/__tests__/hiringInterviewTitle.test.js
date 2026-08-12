import { describe, expect, it } from 'vitest';
import { buildHiringInterviewTitle } from '../hiringInterviewTitle.js';
import { suggestInterviewRound } from '../../constants/hiringInterviewRounds.js';

describe('buildHiringInterviewTitle', () => {
  it('joins round, candidate, and job', () => {
    expect(buildHiringInterviewTitle({
      interviewRound: 'initial',
      candidateName: 'Jane Doe',
      jobTitle: 'BCBA'
    })).toBe('Initial interview — Jane Doe — BCBA');
  });

  it('supports custom other label', () => {
    expect(buildHiringInterviewTitle({
      interviewRound: 'other',
      roundLabelCustom: 'Culture fit',
      candidateName: 'Jane Doe',
      jobTitle: 'BCBA'
    })).toBe('Culture fit — Jane Doe — BCBA');
  });
});

describe('suggestInterviewRound', () => {
  it('advances through initial, second, third, panel', () => {
    expect(suggestInterviewRound([])).toBe('initial');
    expect(suggestInterviewRound([{ status: 'completed' }])).toBe('second');
    expect(suggestInterviewRound([
      { status: 'completed' },
      { status: 'scheduled' }
    ])).toBe('third');
    expect(suggestInterviewRound([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'scheduled' }
    ])).toBe('panel');
  });

  it('ignores cancelled interviews', () => {
    expect(suggestInterviewRound([{ status: 'cancelled' }])).toBe('initial');
  });
});
