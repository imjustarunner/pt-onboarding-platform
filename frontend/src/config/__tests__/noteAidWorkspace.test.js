import { describe, expect, it } from 'vitest';
import {
  aidAllowsInteractiveComplexity,
  aidAttachesToClientChart,
  aidAttachesQuestionnaires,
  aidDiagnosisMode,
  aidIsVisibleForTiers,
  aidKind,
  aidRequiresProviderSupervisorSign,
  aidSkipsMentalStatusExam,
  aidUsesContentReview,
  aidUsesFreeformCsPathway,
  aidServiceCodeDisplay,
  findNoteAidById,
  isSocialDeterminantCode,
  orderNoteAidCategoriesForHcbs,
  resolveTreatmentPlanAidId
} from '../noteAidWorkspace.js';
import {
  SESSION_RECORDING_NOTE_AIDS,
  defaultProgressNoteAidIdFromHcbsCategory,
  resolveSessionRecordingNoteAid
} from '../sessionRecordingAccess.js';

describe('note aid kinds', () => {
  it('puts Code Decider first in Universal Aids', () => {
    const universal = findNoteAidById('code_decider');
    expect(universal?.category?.id).toBe('universal');
    expect(universal?.aid?.autoSelect).toBe(true);
    expect(universal?.aid?.pinToTop).toBe(true);
    expect(findNoteAidById('90791_note')).toBeNull();
    expect(findNoteAidById('h0032_consult')).toBeNull();
  });

  it('keeps 90839 crisis under psychotherapy for intern_plus only', () => {
    const crisis = findNoteAidById('crisis_90839')?.aid;
    expect(crisis?.serviceCode).toBe('90839');
    expect(crisis?.requiresCredentialTier).toEqual(['intern_plus']);
    expect(aidIsVisibleForTiers(crisis, 'intern_plus')).toBe(true);
    expect(aidIsVisibleForTiers(crisis, 'bachelor')).toBe(false);
  });

  it('disables PCP by default', () => {
    const pcp = findNoteAidById('pcp_note')?.aid;
    expect(pcp?.disabledByDefault).toBe(true);
    expect(aidIsVisibleForTiers(pcp, 'intern_plus')).toBe(false);
    expect(aidIsVisibleForTiers({ ...pcp, enabledOverride: true }, 'intern_plus')).toBe(true);
  });

  it('auto-attaches questionnaires on 90791 / H0031 / treatment summary', () => {
    expect(aidAttachesQuestionnaires(findNoteAidById('90791_intake_plan')?.aid)).toBe(true);
    expect(aidAttachesQuestionnaires(findNoteAidById('h0031_intake')?.aid)).toBe(true);
    expect(aidAttachesQuestionnaires(findNoteAidById('treatment_summary')?.aid)).toBe(true);
  });

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

  it('uses Freeform + CSNoteBuild for H0023, H0031 additional, and H0032 (never SOAP)', () => {
    const h0023 = findNoteAidById('h0023')?.aid;
    const add = findNoteAidById('h0031_additional')?.aid;
    const h0032 = findNoteAidById('h0032_plan')?.aid;
    expect(aidUsesFreeformCsPathway(h0023)).toBe(true);
    expect(aidUsesFreeformCsPathway(add)).toBe(true);
    expect(aidUsesFreeformCsPathway(h0032)).toBe(true);
    expect(aidKind(h0023)).toBe('progress');
    expect(aidKind(h0032)).toBe('progress');
    expect(aidAllowsInteractiveComplexity(h0023)).toBe(false);
    expect(aidAllowsInteractiveComplexity(h0032)).toBe(false);
    expect(aidSkipsMentalStatusExam(h0023)).toBe(true);
    expect(aidSkipsMentalStatusExam(h0032)).toBe(true);
    expect(aidDiagnosisMode(h0023)).toBe('none');
  });

  it('termination attaches to client chart with content Review (not supervisor cosign)', () => {
    const aid = findNoteAidById('termination')?.aid;
    expect(aidKind(aid)).toBe('termination');
    expect(aidAttachesToClientChart(aid)).toBe(true);
    expect(aidUsesContentReview(aid)).toBe(true);
  });

  it('treatment summary is a printable document with provider + supervisor sign', () => {
    const aid = findNoteAidById('treatment_summary')?.aid;
    expect(aidKind(aid)).toBe('summary');
    expect(aidAttachesToClientChart(aid)).toBe(true);
    expect(aidUsesContentReview(aid)).toBe(false);
    expect(aidRequiresProviderSupervisorSign(aid)).toBe(true);
    expect(aid?.printableDocument).toBe(true);
  });

  it('H0031 intake is Z/R only without MSE; H0004 note is SOIP without MSE', () => {
    const intake = findNoteAidById('h0031_intake')?.aid;
    const h0004 = findNoteAidById('h0004_note')?.aid;
    expect(aidDiagnosisMode(intake)).toBe('zr_only');
    expect(aidSkipsMentalStatusExam(intake)).toBe(true);
    expect(aidSkipsMentalStatusExam(h0004, 'H0004')).toBe(true);
    expect(isSocialDeterminantCode('Z55.3')).toBe(true);
    expect(isSocialDeterminantCode('F41.1')).toBe(false);
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

  it('shows psychotherapy code group as 90839/90837/90834/90832 on library cards', () => {
    const aid = findNoteAidById('psychotherapy')?.aid;
    expect(aidServiceCodeDisplay(aid)).toBe('90839/90837/90834/90832');
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
