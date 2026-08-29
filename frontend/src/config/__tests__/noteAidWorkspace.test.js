import { describe, expect, it } from 'vitest';
import {
  aidAllowsInteractiveComplexity,
  aidKind,
  aidServiceCodeDisplay,
  findNoteAidById,
  orderNoteAidCategoriesForHcbs,
  resolveTreatmentPlanAidId
} from '../noteAidWorkspace.js';
import {
  SESSION_RECORDING_NOTE_AIDS,
  defaultProgressNoteAidIdFromHcbsCategory,
  resolveSessionRecordingNoteAid
} from '../sessionRecordingAccess.js';

describe('note aid kinds', () => {
  it('keeps psychotherapy / H0004 note / H2014 progress aids in Note Aid', () => {
    expect(findNoteAidById('psychotherapy')?.aid?.toolId).toBe('clinical_psychotherapy_note');
    expect(findNoteAidById('h0004_note')?.aid?.toolId).toBe('clinical_h0004_note');
    expect(findNoteAidById('h2014_group')?.aid?.toolId).toBe('clinical_h2014_group');
    expect(findNoteAidById('h2014_individual')?.aid?.toolId).toBe('clinical_h2014_individual');
  });

  it('treats psychotherapy progress notes as progress', () => {
    const aid = findNoteAidById('psychotherapy')?.aid;
    expect(aidKind(aid)).toBe('progress');
    expect(aidAllowsInteractiveComplexity(aid)).toBe(true);
  });

  it('keeps treatment plans in Note Aid', () => {
    expect(findNoteAidById('h0004_plan')?.aid?.toolId).toBe('clinical_h0004_plan');
    expect(findNoteAidById('psychotherapy_plan')?.aid?.toolId).toBe('clinical_psychotherapy_plan');
    expect(findNoteAidById('tpt_plan')?.aid?.toolId).toBe('clinical_tpt_plan');
  });

  it('resolves matching treatment plan aid by service line', () => {
    expect(resolveTreatmentPlanAidId({ serviceCode: 'H0004' })).toBe('h0004_plan');
    expect(resolveTreatmentPlanAidId({ serviceCode: '90837' })).toBe('psychotherapy_plan');
    expect(resolveTreatmentPlanAidId({ categoryId: 'therapy_tutoring' })).toBe('tpt_plan');
    expect(resolveTreatmentPlanAidId({ noteAidId: 'h0004_note' })).toBe('h0004_plan');
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

describe('session recording note aids', () => {
  it('uses the same progress-note gems for live session capture', () => {
    const ids = SESSION_RECORDING_NOTE_AIDS.map((a) => a.id);
    expect(ids).toContain('psychotherapy');
    expect(ids).toContain('h0004_note');
    expect(ids).toContain('h2014_group');
    expect(ids).toContain('h2014_individual');
  });

  it('resolves note aid from service code', () => {
    expect(resolveSessionRecordingNoteAid({ serviceCode: '90837' })?.id).toBe('psychotherapy');
    expect(resolveSessionRecordingNoteAid({ serviceCode: 'H0004' })?.id).toBe('h0004_note');
    expect(resolveSessionRecordingNoteAid({ serviceCode: 'H2014' })?.id).toBe('h2014_individual');
  });

  it('defaults progress note template from HCBS category', () => {
    expect(defaultProgressNoteAidIdFromHcbsCategory(1)).toBe('h0004_note');
    expect(defaultProgressNoteAidIdFromHcbsCategory(2)).toBe('psychotherapy');
    expect(defaultProgressNoteAidIdFromHcbsCategory(3)).toBe('psychotherapy');
    expect(defaultProgressNoteAidIdFromHcbsCategory(null)).toBe('psychotherapy');
  });
});

describe('note aid library order', () => {
  it('shows H0004 first for HCBS cat 1 and psychotherapy first for cat 2/3', () => {
    const cats = [
      { id: 'universal', aids: [{ id: 'h0023' }, { id: 'h0004_note' }] },
      { id: 'psychotherapy', aids: [{ id: 'psychotherapy' }] }
    ];
    expect(orderNoteAidCategoriesForHcbs(cats, 1)[0].id).toBe('universal');
    expect(orderNoteAidCategoriesForHcbs(cats, 1)[0].aids[0].id).toBe('h0004_note');
    expect(orderNoteAidCategoriesForHcbs(cats, 2)[0].id).toBe('psychotherapy');
    expect(orderNoteAidCategoriesForHcbs(cats, 3)[0].id).toBe('psychotherapy');
  });
});
