/**
 * Note Aid workspace categories — mirrors the Gemini Gems catalog page.
 * toolId values must match CLINICAL_NOTE_AGENT_TOOLS in
 * backend/src/config/clinicalNoteAgentTools.js (AGENT_PROMPTS = gem instructions).
 */

/** Billing add-ons / unused codes — never shown as Note Type choices. */
export const HIDDEN_NOTE_AID_CODES = new Set([
  '90785', // interactive complexity add-on
  '90840', // crisis add-on
  '90849',
  '90875'
]);

/**
 * Collapsed billing-code groups (still used when an aid needs a CPT/HCPCS).
 */
export const NOTE_TYPE_CODE_GROUPS = [
  {
    id: 'psychotherapy',
    codes: ['90832', '90834', '90837'],
    primary: '90837',
    label: '90832 / 90834 / 90837 — Psychotherapy progress note'
  },
  {
    id: 'family_couples',
    codes: ['90846', '90847'],
    primary: '90847',
    label: '90846 / 90847 — Family/couples psychotherapy'
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
        id: 'h0023',
        label: 'H0023 (Planned Outreach and Engagement Activities)',
        toolId: 'clinical_h0023_full_packet',
        serviceCode: 'H0023',
        guidance:
          'Type in all information acquired from the engagement activity for all interactions that span at least 8min. The format is consultation.'
      },
      {
        id: 'h0031_intake',
        label: 'H0031 (Initial Intake Assessment)',
        toolId: 'clinical_h0031_intake',
        serviceCode: 'H0031',
        guidance: 'Paste in the client history, type in all information acquired from intake.'
      },
      {
        id: 'h0031_additional',
        label: 'H0031 (Additional Assessment/Session via Consultation Session Type)',
        toolId: 'clinical_h0031_additional',
        serviceCode: 'H0031',
        guidance:
          'Type in all information acquired from the additional intake appointment or session. Use any additional information necessary. The format is consultation.'
      },
      {
        id: 'h0032_plan',
        label: 'H0032 Note Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0032_plan_development',
        serviceCode: 'H0032',
        guidance:
          'If you have a session with a client or their parent for which 51% of the time was spent to update the treatment plan/get approval/etc., use this. No min time.'
      },
      {
        id: 'h0004_plan',
        label: 'H0004 Treatment Plan Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0004_plan',
        serviceCode: 'H0004',
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression.'
      },
      {
        id: 'h0004_note',
        label: 'H0004 Note Writer (Bachelor’s Level and Up)',
        toolId: 'clinical_h0004_note',
        serviceCode: 'H0004',
        guidance:
          'Used to document standard counseling sessions. Minimum 8 minutes required. Symptoms, objective content, interventions, and plan.'
      },
      {
        id: 'termination',
        label: 'Termination Note Writer',
        toolId: 'clinical_termination',
        serviceCode: null,
        guidance:
          'Paste in the most recent treatment plan and progress note, write a blurb about their progress and why they are terminating.'
      },
      {
        id: 'treatment_summary',
        label: 'Treatment Summary Aid',
        toolId: 'clinical_treatment_summary',
        serviceCode: null,
        guidance:
          'Paste in the most recent treatment plan and progress note, write a blurb about their progress, their attendance, participation, and other pertinent information.'
      },
      {
        id: 'code_decider',
        label: 'Code Decider and Progress Note Writer',
        toolId: 'clinical_code_decider',
        serviceCode: null,
        autoSelect: true,
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
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
        guidance:
          'Paste in the client history, type in all information acquired from intake which will then prompt to create a treatment plan following the completion of the intake.'
      },
      {
        id: 'psychotherapy',
        label: 'Progress Note Aid (Individual Psychotherapy)',
        toolId: 'clinical_psychotherapy_note',
        serviceCode: '90837',
        codeGroupId: 'psychotherapy',
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s progress, etc.'
      },
      {
        id: 'family',
        label: 'Progress Note Aid (Family Psychotherapy)',
        toolId: 'clinical_family_note',
        serviceCode: '90847',
        codeGroupId: 'family_couples',
        guidance:
          'Type in all information that occurred during the session, your interpretation of the client’s progress, who was present, who consented, etc.'
      },
      {
        id: 'diagnosis',
        label: 'Psychotherapy Diagnosis and Justification writer',
        toolId: 'clinical_diagnosis_writer',
        serviceCode: null,
        guidance:
          'Paste in the presenting problem, type any symptoms experienced, reference how their lives are being impacted and any thoughts on the likely diagnosis.'
      },
      {
        id: 'psychotherapy_plan',
        label: 'Psychotherapy Treatment Plan Writer/Updater',
        toolId: 'clinical_psychotherapy_plan',
        serviceCode: null,
        guidance:
          'Paste in the presenting problem or chief complaint, the Hx of symptoms, the diagnosis, and the justification. Write any additional information to help it tailor a treatment plan for your specific client. OR Paste in the old treatment plan and write how it needs to be altered based on progress or regression.'
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
        id: '90791_note',
        label: '90791 Note Aid (documentation only)',
        toolId: 'clinical_90791_note_aid',
        serviceCode: '90791',
        guidance: 'Paste in the client history and type in all information acquired from intake.'
      },
      {
        id: 'h0032_consult',
        label: 'H0032 Consultation Note',
        toolId: 'clinical_h0032_consult',
        serviceCode: 'H0032',
        guidance: 'Document a plan-review consultation in a single clinical paragraph.'
      },
      {
        id: 'pcp_note',
        label: 'PCP Note Aid',
        toolId: 'clinical_pcp_note',
        serviceCode: null,
        guidance: 'Document Parent–Child Partnership session content in the approved PCP note format.'
      },
      {
        id: 'crisis_90839',
        label: '90839 — Crisis Psychotherapy',
        toolId: 'clinical_psychotherapy_note',
        serviceCode: '90839',
        guidance: 'Document crisis psychotherapy session content, interventions, and safety/plan.'
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
