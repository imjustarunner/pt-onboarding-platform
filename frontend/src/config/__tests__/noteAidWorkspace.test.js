import { describe, expect, it } from 'vitest';
import { aidAllowsInteractiveComplexity, aidKind, aidServiceCodeDisplay, findNoteAidById } from '../noteAidWorkspace.js';

describe('note aid kinds', () => {
  it('treats psychotherapy progress notes as progress', () => {
    const aid = findNoteAidById('psychotherapy')?.aid;
    expect(aidKind(aid)).toBe('progress');
    expect(aidAllowsInteractiveComplexity(aid)).toBe(true);
  });

  it('does not allow Interactive Complexity on plans or intakes', () => {
    expect(aidAllowsInteractiveComplexity(findNoteAidById('h0032_plan')?.aid)).toBe(false);
    expect(aidAllowsInteractiveComplexity(findNoteAidById('h0031_intake')?.aid)).toBe(false);
    expect(aidAllowsInteractiveComplexity(findNoteAidById('90791_intake_plan')?.aid)).toBe(false);
  });

  it('allows Interactive Complexity on Code Decider (progress-note writer)', () => {
    expect(aidAllowsInteractiveComplexity(findNoteAidById('code_decider')?.aid)).toBe(true);
  });

  it('shows psychotherapy code group as 90837/90834/90832 on library cards', () => {
    const aid = findNoteAidById('psychotherapy')?.aid;
    expect(aidServiceCodeDisplay(aid)).toBe('90837/90834/90832');
  });
});
