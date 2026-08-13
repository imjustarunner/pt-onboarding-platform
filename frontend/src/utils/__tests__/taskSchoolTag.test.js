import { describe, expect, it } from 'vitest';
import { taskSchoolTag, taskOutreachSchoolId } from '../taskSchoolTag.js';

describe('taskSchoolTag', () => {
  it('prefers the joined school_tag column', () => {
    expect(taskSchoolTag({ school_tag: 'East High', metadata: { schoolName: 'Other' } })).toBe('East High');
  });

  it('falls back to metadata', () => {
    expect(taskSchoolTag({ metadata: { schoolName: 'Ashley Elementary' } })).toBe('Ashley Elementary');
  });

  it('reads outreach school id from column or metadata', () => {
    expect(taskOutreachSchoolId({ outreach_school_id: 12 })).toBe(12);
    expect(taskOutreachSchoolId({ metadata: { outreachSchoolId: '9' } })).toBe(9);
  });
});
