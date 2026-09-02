/**
 * Note Aid workspace categories — mirrors the Gemini Gems catalog page.
 * toolId values must match CLINICAL_NOTE_AGENT_TOOLS in
 * backend/src/config/clinicalNoteAgentTools.js (AGENT_PROMPTS = gem instructions).
 */
import {
  defaultProgressNoteAidIdFromHcbsCategory,
  preferredNoteAidCategoryIdFromHcbsCategory,
  withPreferredFirst
} from './sessionRecordingAccess.js';

/** Billing add-ons / unused codes — never shown as Note Type choices. */
export const HIDDEN_NOTE_AID_CODES = new Set([
  '90785', // interactive complexity add-on
  '90840', // crisis add-on
  '99051', // after-hours add-on
  '90849',
  '90875'
]);

/** Catalog aids removed from the picker (kept in agent tools for legacy drafts only). */
export const RETIRED_NOTE_AID_IDS = new Set([
  '90791_note',
  'h0032_consult'
]);

/**
 * Collapsed billing-code groups (still used when an aid needs a CPT/HCPCS).
 */
export const NOTE_TYPE_CODE_GROUPS = [
  {
    id: 'psychotherapy',
    codes: ['90832', '90834', '90837', '90839'],
    primary: '90837',
    label: '90832 / 90834 / 90837 / 90839 — Psychotherapy progress note'
  },
  {
    id: 'family_couples',
    codes: ['90846', '90847'],
    primary: '90847',
    label: '90846 / 90847 — Family or Couples Psychotherapy'
  },
  {
    id: 'h2015_h2016',
    codes: ['H2015', 'H2016'],
    primary: 'H2015',
    label: 'H2015 / H2016 — Comprehensive community support'
  }
];

/**
 * Screenshot families first, then Additional aids for extras.
 * guidance = clinician-facing instruction from the gems page.
 */
export const NOTE_AID_CATEGORIES = [
  {
    id: 'universal',
    label: 'Universal Aids',
    aids: [
      {
        id: 'code_decider',
        label: 'Let AI choose for me — Code Decider and Progress Note Writer',
        toolId: 'clinical_code_decider',
        serviceCode: null,
        autoSelect: true,
        pinToTop: true,
        guidance:
          'Type or speak everything that happened in the session (participation, progress, benefit). The Code Decider picks the best eligible billing code for your credential (including intern_plus) and writes the progress note. Use this when you are not sure which Note Aid to open.'
      },
      {
        id: 'h0023',
        label: 'H0023 (Planned Outreach and Engagement Activities)',
        toolId: 'clinical_h0023_full_packet',
        serviceCode: 'H0023',
        kind: 'progress',
        pathwayMode: 'freeform_cs',
        skipMse: true,
        diagnosisMode: 'none',
        guidance:
          'Type in all information from the engagement activity (8+ minutes). Output is a Colorado Service Documentation Standards narrative paragraph — not SOAP. Use Freeform or CSNoteBuild.'
      },
      {
        id: 'h0031_intake',
        label: 'H0031 (Initial Intake Assessment)',
        toolId: 'clinical_h0031_intake',
        serviceCode: 'H0031',
        kind: 'intake',
        skipMse: true,
        diagnosisMode: 'zr_only',
        attachQuestionnaires: true,
        guidance:
          'Paste client history and intake information. Same structured intake flow as 90791, but bachelor’s-level: Z and R (social determinant) codes only — no DSM mental-health diagnoses. No mental status exam. Recent unattached questionnaires (e.g. GAD, PHQ, PSC) are auto-included.'
      },
      {
        id: 'h0031_additional',
        label: 'H0031 (Additional Assessment/Session via Consultation Session Type)',
        toolId: 'clinical_h0031_additional',
        serviceCode: 'H0031',
        kind: 'progress',
        pathwayMode: 'freeform_cs',
        skipMse: true,
        diagnosisMode: 'zr_only',
        attachQuestionnaires: true,
        guidance:
          'Type additional assessment / collateral session content. Freeform Colorado narrative (not full 90791 sections). Z/R codes only when supported — no DSM diagnoses. No mental status exam. Use Freeform or CSNoteBuild. Recent unattached questionnaires are auto-included when available.'
      },
      {
        id: 'h0032_plan',
        label: 'H0032 Note Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0032_plan_development',
        serviceCode: 'H0032',
        kind: 'progress',
        pathwayMode: 'freeform_cs',
        skipMse: true,
        diagnosisMode: 'chart',
        guidance:
          'If you have a session with a client or their parent for which 51% of the time was spent to update the treatment plan/get approval/etc., use this. No min time. Output is a Colorado Service Documentation Standards narrative paragraph — not SOAP. Use Freeform or CSNoteBuild.'
      },
      {
        id: 'h0004_plan',
        label: 'H0004 Treatment Plan Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0004_plan',
        serviceCode: 'H0004',
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression. Uses the same Goal / Objective (1–10 scale) / Projected Time / Discharge headers as the psychotherapy plan writer, with bachelor’s-level / H0004 skills-based wording only — not psychotherapy clinical language.'
      },
      {
        id: 'h0004_note',
        label: 'H0004 Note Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0004_note',
        serviceCode: 'H0004',
        kind: 'progress',
        skipMse: true,
        diagnosisMode: 'chart',
        guidance:
          'Same SOIP panels as 90837 (Subjective, Objective, Interventions, Plan) with bachelor’s-level wording. Minimum 8 minutes. Mental status exam is not used for H0004.'
      },
      {
        id: 'termination',
        label: 'Termination Note Writer',
        toolId: 'clinical_termination',
        serviceCode: null,
        kind: 'termination',
        attachMode: 'client_chart',
        documentationFlow: 'review',
        requiresBillableEvent: false,
        sessionless: false,
        skipMse: true,
        diagnosisMode: 'none',
        guidance:
          'Paste in the most recent treatment plan and progress note, write a blurb about their progress and why they are terminating. Attaches to the client chart like a contact note (not a billable session). Uses content Review (not supervisor cosign).'
      },
      {
        id: 'treatment_summary',
        label: 'Treatment Summary Aid',
        toolId: 'clinical_treatment_summary',
        serviceCode: null,
        kind: 'summary',
        attachMode: 'client_chart',
        documentationFlow: 'provider_supervisor_sign',
        requiresBillableEvent: false,
        printableDocument: true,
        skipMse: true,
        diagnosisMode: 'chart',
        attachQuestionnaires: true,
        guidance:
          'Full document using the client’s attendance, progress notes, scaled objective responses over time, and treatment plan. Add clinician notes on participation and other pertinent information. Recent unattached questionnaires (GAD/PHQ/PSC) are auto-included. Output prints on packet defaults (footer mark + page; no cover, no version). Provider and clinical supervisor both sign; supports print, digital share, and upload of signed copies.'
      }
    ]
  },
  {
    id: 'psychotherapy',
    label: 'Psychotherapy Aids',
    aids: [
      {
        id: '90791_intake_plan',
        label: '90791 Note Writer and Treatment Plan Writer - 90791 Only',
        toolId: 'clinical_90791_intake_plan',
        serviceCode: '90791',
        attachQuestionnaires: true,
        guidance:
          'Paste in the client history, type in all information acquired from intake which will then prompt to create a treatment plan following the completion of the intake. Recent unattached questionnaires (e.g. GAD, PHQ, PSC) are auto-included for the write-up and diagnostic recommendations.'
      },
      {
        id: 'psychotherapy',
        label: 'Progress Note Aid (Individual Psychotherapy)',
        toolId: 'clinical_psychotherapy_note',
        serviceCode: '90837',
        codeGroupId: 'psychotherapy',
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s progress, etc. Supports 90832 / 90834 / 90837. Sessions over 74 minutes become an extended encounter (90834 × 2).'
      },
      {
        id: 'crisis_90839',
        label: '90839 — Crisis Psychotherapy',
        toolId: 'clinical_psychotherapy_note',
        serviceCode: '90839',
        kind: 'progress',
        requiresCredentialTier: ['intern_plus'],
        guidance:
          'Crisis psychotherapy (intern_plus and above). Type or speak urgent assessment, crisis state, MSE, disposition, mobilization of resources, and interventions to restore safety. Minimum 31 minutes (≤30 switches to 90832). After 74 minutes, 90840 crisis add-on units apply automatically.'
      },
      {
        id: 'family',
        label: 'Progress Note Aid (Family or Couples Psychotherapy)',
        toolId: 'clinical_family_note',
        serviceCode: '90847',
        codeGroupId: 'family_couples',
        guidance:
          'Type in all information that occurred during the session (same SOIP format as individual progress notes). Include who was present, who consented, and clinical progress. Use 90847 when the patient is present or 90846 when documenting collateral/family without the patient present.'
      },
      {
        id: 'diagnosis',
        label: 'Psychotherapy Diagnosis and Justification writer',
        toolId: 'clinical_diagnosis_writer',
        serviceCode: null,
        sessionless: true,
        standaloneModal: 'diagnosis',
        guidance:
          'Paste in the presenting problem, type any symptoms experienced, reference how their lives are being impacted and any thoughts on the likely diagnosis. This tool drafts diagnostic justification for professional review — it does not replace clinical judgment.'
      },
      {
        id: 'psychotherapy_plan',
        label: 'Psychotherapy Treatment Plan Writer/Updater',
        toolId: 'clinical_psychotherapy_plan',
        serviceCode: null,
        sessionless: true,
        standaloneModal: 'treatment_plan',
        guidance:
          'Paste intake/presenting information to draft a treatment plan, or paste an existing plan plus change instructions to update it. Review structured goals/objectives before applying to a client or saving to the library.'
      }
    ]
  },
  {
    id: 'skill_builder',
    label: 'Skill Builder Aids',
    aids: [
      {
        id: 'h2014_group',
        label: 'Group Program (12-Week Program) Progress Note Aid (Skill Builders)',
        toolId: 'clinical_h2014_group',
        serviceCode: 'H2014',
        needsProgram: true,
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
      },
      {
        id: 'h2014_individual',
        label: 'Individual (or group non-program) Progress Note Aid (H2014/H2015/H2016)',
        toolId: 'clinical_h2014_individual',
        serviceCode: 'H2014',
        codeGroupId: 'h2015_h2016',
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
      },
      {
        id: 'skill_builders_plan',
        label: 'Treatment Plan Writer (Skill Builders Group)',
        toolId: 'clinical_skill_builders_plan',
        serviceCode: null,
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression.'
      },
      {
        id: 'individual_plan',
        label: 'Treatment Plan Writer (Skill Builders Individual)',
        toolId: 'clinical_individual_plan',
        serviceCode: 'H2015',
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression.'
      }
    ]
  },
  {
    id: 'therapy_tutoring',
    label: 'Therapy + Tutoring Aids',
    aids: [
      {
        id: 'tpt_note',
        label: 'Progress Note Aid (Therapy + Tutoring)',
        toolId: 'clinical_tpt_note',
        serviceCode: null,
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
      },
      {
        id: 'tpt_plan',
        label: 'Treatment Plan Writer (Therapy + Tutoring)',
        toolId: 'clinical_tpt_plan',
        serviceCode: null,
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression.'
      },
      {
        id: 'nlu_assessment',
        label: 'Intake Assessment Note Aid (Therapy + Tutoring)',
        toolId: 'clinical_nlu_assessment',
        serviceCode: null,
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
      }
    ]
  },
  {
    id: 'additional',
    label: 'Additional aids',
    aids: [
      {
        id: 'h0002',
        label: 'H0002 — Behavioral Health Screening (PSC-17)',
        toolId: 'clinical_psc_17',
        serviceCode: 'H0002',
        guidance: 'Provide PSC-17 item responses and session context for screening documentation.'
      },
      {
        id: 'pcp_note',
        label: 'PCP Note Aid',
        toolId: 'clinical_pcp_note',
        serviceCode: null,
        disabledByDefault: true,
        guidance: 'Document Parent–Child Partnership session content in the approved PCP note format. Disabled by default — enable per tenant in Note Aid settings if needed.'
      },
      {
        id: 'nlu_docs',
        label: 'NLU Clinical Documentation Workflow',
        toolId: 'clinical_nlu_docs',
        serviceCode: null,
        guidance: 'Follow intake → treatment plan → lesson/activities workflow for NLU.'
      }
    ]
  }
];

export function findNoteAidById(aidId) {
  const id = String(aidId || '').trim();
  if (!id) return null;
  for (const cat of NOTE_AID_CATEGORIES) {
    const aid = (cat.aids || []).find((a) => a.id === id);
    if (aid) return { category: cat, aid };
  }
  return null;
}

export function findNoteAidByToolOrCode({ toolId, serviceCode } = {}) {
  const tid = String(toolId || '').trim();
  const code = String(serviceCode || '').trim().toUpperCase();
  if (tid && code) {
    for (const cat of NOTE_AID_CATEGORIES) {
      const aid = (cat.aids || []).find(
        (a) => a.toolId === tid && String(a.serviceCode || '').toUpperCase() === code
      );
      if (aid) return { category: cat, aid };
    }
  }
  if (tid) {
    for (const cat of NOTE_AID_CATEGORIES) {
      const aid = (cat.aids || []).find((a) => a.toolId === tid);
      if (aid) return { category: cat, aid };
    }
  }
  if (code) {
    for (const cat of NOTE_AID_CATEGORIES) {
      const aid = (cat.aids || []).find((a) => String(a.serviceCode || '').toUpperCase() === code);
      if (aid) return { category: cat, aid };
    }
    const group = NOTE_TYPE_CODE_GROUPS.find((g) => g.codes.includes(code));
    if (group) {
      for (const cat of NOTE_AID_CATEGORIES) {
        const aid = (cat.aids || []).find((a) => a.codeGroupId === group.id);
        if (aid) return { category: cat, aid };
      }
    }
  }
  return null;
}

export const NOTE_AID_KIND_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'intake', label: 'Intake' },
  { id: 'progress', label: 'Progress Note' },
  { id: 'plan', label: 'Treatment Plan' },
  { id: 'consultation', label: 'Consultation' },
  { id: 'summary', label: 'Summary' },
  { id: 'termination', label: 'Termination' },
  { id: 'other', label: 'More' }
];

export const NOTE_AID_CATEGORY_TONES = {
  universal: 'blue',
  psychotherapy: 'teal',
  skill_builder: 'purple',
  therapy_tutoring: 'orange',
  additional: 'slate'
};

export function aidKind(aid) {
  if (aid?.kind) return aid.kind;
  const blob = `${aid?.toolId || ''} ${aid?.id || ''} ${aid?.label || ''}`.toLowerCase();
  if (blob.includes('terminat')) return 'termination';
  if (blob.includes('summary')) return 'summary';
  if (
    blob.includes('consult')
    || blob.includes('pcp_note')
  ) {
    return 'consultation';
  }
  if (
    blob.includes('intake')
    || blob.includes('h0031_intake')
    || blob.includes('90791_intake')
    || blob.includes('nlu_assessment')
    || blob.includes('psc_17')
    || blob.includes('h0002')
  ) {
    return 'intake';
  }
  if (blob.includes('_plan') || blob.includes('treatment plan') || blob.includes('plan writer')) {
    return 'plan';
  }
  if (blob.includes('diagnosis') || blob.includes('nlu_docs') || blob.includes('activity development')) {
    return 'other';
  }
  return 'progress';
}

/** Aids that offer Freeform + CSNoteBuild only (never SOAP/SOIP panels). */
export function aidUsesFreeformCsPathway(aid) {
  return String(aid?.pathwayMode || '') === 'freeform_cs';
}

export function aidSkipsMentalStatusExam(aid, serviceCode = '') {
  if (aid?.skipMse) return true;
  const code = String(serviceCode || aid?.serviceCode || '').toUpperCase();
  return code === 'H0004' || code === 'H0031' || code === 'H0023' || code === 'H0032';
}

/** Client-chart attachment (termination / contact-style / treatment summary) — not a billable event. */
export function aidAttachesToClientChart(aid) {
  return String(aid?.attachMode || '') === 'client_chart'
    || aid?.requiresBillableEvent === false
    || aidKind(aid) === 'termination'
    || aidKind(aid) === 'summary';
}

/** Content Review flow (AI content checklist) instead of supervisor cosign — termination/contact. */
export function aidUsesContentReview(aid) {
  const flow = String(aid?.documentationFlow || '');
  if (flow === 'provider_supervisor_sign') return false;
  return flow === 'review' || aidKind(aid) === 'termination';
}

/** Full document needing provider + clinical supervisor signatures (treatment summary). */
export function aidRequiresProviderSupervisorSign(aid) {
  return String(aid?.documentationFlow || '') === 'provider_supervisor_sign'
    || !!aid?.printableDocument
    || aidKind(aid) === 'summary';
}

/**
 * How diagnoses appear on the chart strip for this aid.
 * - full: DSM + Z/R (90791 / psychotherapy)
 * - zr_only: social determinant Z/R codes only (H0031)
 * - none: hide diagnoses block (H0023 outreach)
 * - chart: show whatever is on the chart (H0004 note)
 */
export function aidDiagnosisMode(aid) {
  const mode = String(aid?.diagnosisMode || '').trim();
  if (mode) return mode;
  const code = String(aid?.serviceCode || '').toUpperCase();
  if (code === 'H0031') return 'zr_only';
  if (code === 'H0023') return 'none';
  if (code === 'H0004') return 'chart';
  return 'full';
}

/** True if ICD-10 / psychosocial code is Z or R (social determinants / symptoms). */
export function isSocialDeterminantCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return /^[ZR]\d/.test(c);
}

export function aidSetting(aid) {
  if (aid?.needsProgram || /group program|12-week/i.test(String(aid?.label || ''))) return 'group';
  if (/family/i.test(String(aid?.label || ''))) return 'family';
  return 'individual';
}

/** Library card sublabel — e.g. 90837/90834/90832 for psychotherapy code groups. */
export function aidServiceCodeDisplay(aid) {
  const custom = String(aid?.serviceCodeDisplay || '').trim();
  if (custom) return custom;
  if (aid?.codeGroupId) {
    const g = NOTE_TYPE_CODE_GROUPS.find((x) => x.id === aid.codeGroupId);
    if (g?.codes?.length) {
      const sorted = [...g.codes].sort((a, b) => Number(b) - Number(a));
      return sorted.join('/');
    }
  }
  return String(aid?.serviceCode || '').trim();
}

/** Interactive Complexity (90785) is a progress-note add-on only (not Colorado freeform outreach). */
export function aidAllowsInteractiveComplexity(aid) {
  if (aidUsesFreeformCsPathway(aid)) return false;
  return aidKind(aid) === 'progress';
}

export function aidAttachesQuestionnaires(aid) {
  return !!aid?.attachQuestionnaires;
}

export function aidRequiresCredentialTiers(aid) {
  return Array.isArray(aid?.requiresCredentialTier) ? aid.requiresCredentialTier : [];
}

export function aidIsVisibleForTiers(aid, derivedTier = '') {
  if (!aid || RETIRED_NOTE_AID_IDS.has(aid.id)) return false;
  if (aid.disabledByDefault && !aid.enabledOverride) return false;
  const required = aidRequiresCredentialTiers(aid);
  if (!required.length) return true;
  const tier = String(derivedTier || '').toLowerCase();
  return required.includes(tier);
}

export function aidIsAttachableToSession(aid, agencyOverride = null) {
  if (agencyOverride && Object.prototype.hasOwnProperty.call(agencyOverride, 'attachableToSession')) {
    return !!agencyOverride.attachableToSession;
  }
  if (aid?.attachableToSession != null) return !!aid.attachableToSession;
  if (aid?.requiresBillableEvent === false || aidAttachesToClientChart(aid)) return false;
  return aidKind(aid) === 'progress' || aidKind(aid) === 'intake';
}

export function aidIsAttachableToClaim(aid, agencyOverride = null) {
  if (agencyOverride && Object.prototype.hasOwnProperty.call(agencyOverride, 'attachableToClaim')) {
    return !!agencyOverride.attachableToClaim;
  }
  if (aid?.attachableToClaim != null) return !!aid.attachableToClaim;
  return aidIsAttachableToSession(aid, agencyOverride);
}

/**
 * Resolve which treatment-plan aid to open for updater / chart flows.
 * Same Goal/Objective/1–10 structure for all; different writing directions per aid.
 */
export function resolveTreatmentPlanAidId({
  noteAidId = '',
  toolId = '',
  serviceCode = '',
  categoryId = ''
} = {}) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const blob = `${noteAidId || ''} ${toolId || ''} ${categoryId || ''}`.toLowerCase();

  if (code === 'H0004' || blob.includes('h0004')) return 'h0004_plan';
  if (
    code === 'H2014'
    || code === 'H2015'
    || code === 'H2016'
    || blob.includes('skill_builder')
    || blob.includes('h2014')
    || blob.includes('individual_plan')
  ) {
    if (blob.includes('skill_builders_plan') || blob.includes('group')) return 'skill_builders_plan';
    return 'individual_plan';
  }
  if (
    blob.includes('tpt')
    || blob.includes('therapy_tutoring')
    || blob.includes('nlu')
    || blob.includes('tutor')
  ) {
    return 'tpt_plan';
  }
  if (code === '90791' || blob.includes('90791')) return '90791_intake_plan';
  if (blob.includes('h0004_plan')) return 'h0004_plan';
  if (blob.includes('skill_builders_plan')) return 'skill_builders_plan';
  if (blob.includes('individual_plan')) return 'individual_plan';
  if (blob.includes('tpt_plan')) return 'tpt_plan';
  return 'psychotherapy_plan';
}

/** Put the clinician’s usual progress-note family first in the gem library. */
export function orderNoteAidCategoriesForHcbs(categories, hcbsCategory) {
  const preferredAid = defaultProgressNoteAidIdFromHcbsCategory(hcbsCategory);
  const preferredCat = preferredNoteAidCategoryIdFromHcbsCategory(hcbsCategory);
  const mapped = (Array.isArray(categories) ? categories : []).map((cat) => ({
    ...cat,
    aids: withPreferredFirst(cat.aids || [], preferredAid)
  }));
  return withPreferredFirst(mapped, preferredCat);
}

/** Flat list of built-in catalog aids (for admin settings). */
export function listBuiltInNoteAids() {
  const out = [];
  for (const cat of NOTE_AID_CATEGORIES) {
    for (const aid of cat.aids || []) {
      if (RETIRED_NOTE_AID_IDS.has(aid.id)) continue;
      out.push({ ...aid, categoryId: cat.id, categoryLabel: cat.label });
    }
  }
  return out;
}

/**
 * Apply per-tenant enable/disable, people scope, and custom aids to the picker catalog.
 */
export function mergeAgencyCatalogIntoCategories(categories, catalog = {}, derivedTier = '') {
  const settingsById = new Map(
    (catalog.settings || []).map((s) => [String(s.catalog_aid_id || s.catalogAidId), s])
  );
  const peopleScopedCatalog = new Set(
    (catalog.peopleScopedCatalogIds || []).map((id) => String(id))
  );
  const peopleScopedCustom = new Set(
    (catalog.peopleScopedCustomIds || []).map((id) => Number(id))
  );
  const userCatalogAssigned = new Set(
    (catalog.assignments || [])
      .filter((a) => a.catalog_aid_id || a.catalogAidId)
      .map((a) => String(a.catalog_aid_id || a.catalogAidId))
  );
  const userCustomAssigned = new Set(
    (catalog.assignments || [])
      .filter((a) => a.custom_aid_id || a.customAidId)
      .map((a) => Number(a.custom_aid_id || a.customAidId))
  );

  const mapped = (categories || []).map((cat) => {
    const aids = (cat.aids || [])
      .map((aid) => {
        const setting = settingsById.get(String(aid.id));
        const enabledOverride = setting
          ? !!(setting.enabled === true || setting.enabled === 1 || setting.enabled === '1')
          : !!aid.enabledOverride;
        const disabledBySetting = setting
          && (setting.enabled === false || setting.enabled === 0 || setting.enabled === '0');
        const next = {
          ...aid,
          enabledOverride: enabledOverride || (!aid.disabledByDefault && !disabledBySetting),
          titleOverride: setting?.title_override || setting?.titleOverride || null,
          label: setting?.title_override || setting?.titleOverride || aid.label,
          agencyAttachableToSession: setting?.attachable_to_session ?? setting?.attachableToSession,
          agencyAttachableToClaim: setting?.attachable_to_claim ?? setting?.attachableToClaim
        };
        if (aid.disabledByDefault && !enabledOverride) return null;
        if (disabledBySetting) return null;
        if (!aidIsVisibleForTiers(next, derivedTier)) return null;
        if (peopleScopedCatalog.has(String(aid.id)) && !userCatalogAssigned.has(String(aid.id))) {
          return null;
        }
        return next;
      })
      .filter(Boolean);
    return { ...cat, aids };
  }).filter((cat) => (cat.aids || []).length);

  const customAids = (catalog.customAids || []).filter((row) => {
    if (row.enabled === false || row.enabled === 0 || row.enabled === '0') return false;
    const cid = Number(row.id);
    if (peopleScopedCustom.has(cid) && !userCustomAssigned.has(cid)) return false;
    return true;
  });

  if (!customAids.length) return mapped;

  const customCategory = {
    id: 'tenant_custom',
    label: 'Custom aids (this organization)',
    aids: customAids.map((row) => ({
      id: `custom_${row.id}`,
      customAidId: Number(row.id),
      label: row.title,
      toolId: row.base_tool_id || row.baseToolId || 'clinical_psychotherapy_note',
      serviceCode: row.service_code || row.serviceCode || null,
      guidance: row.guidance || '',
      systemPrompt: row.system_prompt || row.systemPrompt || null,
      trainingNotes: row.training_notes || row.trainingNotes || null,
      kbFolders: Array.isArray(row.kbFolders)
        ? row.kbFolders
        : (Array.isArray(row.kb_folders) ? row.kb_folders : []),
      attachableToSession: !!(row.attachable_to_session ?? row.attachableToSession),
      attachableToClaim: !!(row.attachable_to_claim ?? row.attachableToClaim),
      kind: 'progress',
      isCustom: true
    }))
  };
  return [...mapped, customCategory];
}

export function flattenNoteAids(categories = NOTE_AID_CATEGORIES) {
  const out = [];
  for (const cat of categories) {
    for (const aid of cat.aids || []) {
      out.push({
        ...aid,
        categoryId: cat.id,
        categoryLabel: cat.label,
        kind: aidKind(aid),
        setting: aidSetting(aid)
      });
    }
  }
  return out;
}
