// Fictional browser-only examples. These records never reference production IDs.
export const DEMO_NOTE_NOTICE = 'Demo only: this does not sign or complete a note. Nothing is saved, submitted or sent.';
export const DEMO_DRAFT_IDS = [990131, 990132, 990133];
export const DEMO_COSIGN_IDS = [990181, 990182];

/** Fixed action names only: never derive an analytics label from clinical text. */
export function demoNoteAction(button) {
  const label = String(button?.textContent || '').replace(/\s+/g, ' ').trim();
  if (/^(?:co-?sign|sign)(?:\s|$)/i.test(label)) return /open next/i.test(label) ? 'sign-next' : 'sign';
  if (/^(?:save(?:\s|$)|review & save|complete (?:review|termination)|approve (?:and|&)|send (?:request|feedback)|submit)/i.test(label)) return 'save';
  if (/^(?:generate|regenerate|revise|transcribe|start recording|record session|send consent|request consent)/i.test(label)) return 'generate';
  if (/^(?:delete|archive|restore|legal hold|release hold)/i.test(label)) return 'save';
  return null;
}

function dayBefore(ymd, count = 7) {
  const day = new Date(`${ymd}T12:00:00`);
  day.setDate(day.getDate() - count);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function createDemoNoteFixtures({ practice, actor, clients, providers = [], weekStart }) {
  const previousDate = dayBefore(weekStart);
  const clientFor = index => clients[index % clients.length];
  const clientName = client => client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ');
  const providerFor = client => providers.find(provider => Number(provider.id) === Number(client?.provider_id)) || actor;
  const providerName = provider => provider.full_name || provider.name || [provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Avery Lane';
  const diagnosisFor = client => {
    const match = String(client?.diagnosis || '').match(/^([A-Z]\d{2}(?:\.\d+)?)\s*[·–-]\s*(.+)$/);
    return match ? { icd10Code: match[1], description: match[2] } : client?.diagnosis ? null
      : { icd10Code: 'F43.23', description: 'Adjustment disorder with mixed anxiety and depressed mood' };
  };
  const sections = index => ({
    Subjective: [
      'The client described using a grounding exercise independently on three days this week. They reported feeling more confident managing stressful transitions and identified one situation they would like to practice before the next visit.',
      'The client reported a more consistent evening routine and described setting a helpful boundary. They identified continued difficulty speaking up when plans change.',
      'The client described completing a planned social activity and using paced breathing before a challenging conversation. They would like to build on this progress.'
    ][index % 3],
    Objective: 'The client arrived on time, participated throughout the 45-minute individual session and practiced the selected skill with less prompting. Speech was clear and thought processes were organized. Affect was congruent with the discussion.',
    Interventions: 'Used collaborative goal review, cognitive reframing and guided grounding practice. Connected the client’s example to their treatment objective and rehearsed a practical plan to use the skill between sessions.',
    Plan: 'Continue weekly individual therapy. Practice the selected coping skill on three days before the next visit and record what helped. Review the client’s feedback and treatment objective rating at the next session.'
  });
  const structuredChart = client => ({
    clientId: client.id,
    mentalStatusExam: { allNormal: true, domains: {} },
    riskAssessment: { patientDeniesAll: true, notes: 'Fictional example: client denied current safety concerns. Protective factors and available supports were reviewed.' },
    medications: { noneCurrently: true },
    diagnosticJustification: 'Fictional example: symptoms associated with a recent life transition affect coping and daily routines.',
    durationMinutes: 45, locationLabel: 'Telehealth · client at home', startTime: '09:00', endTime: '09:45', participants: 'Client Only', placeOfService: '10', serviceLocationId: 990151
  });
  const outputFor = (client, index, aiGenerated = false) => ({
    sections: sections(index),
    meta: {
      toolId: 'clinical_psychotherapy_note', serviceCode: '90834', noteKind: 'progress', manualSections: !aiGenerated, aiGenerated,
      ...(aiGenerated ? { source: 'session_recording', recordingConsent: { status: 'consented', exampleOnly: true }, model: 'Illustrative consented transcript example' } : {}),
      structuredChart: structuredChart(client),
      sessionContext: { sourceTimezone: 'America/Denver', locationLabel: 'Telehealth · client at home', durationMinutes: 45, startTimeLocal: '09:00', endTimeLocal: '09:45', participants: 'Client Only', serviceCode: '90834', serviceLocationId: 990151, placeOfService: '10' },
      prescribedFrequency: 'Weekly individual therapy', treatmentRecommendation: 'continue'
    }
  });
  const drafts = DEMO_DRAFT_IDS.map((id, index) => {
    const client = clientFor(index);
    return {
      id, client_id: client.id, client_full_name: clientName(client), initials: client.initials,
      agency_id: practice.id, client_agency_id: practice.id, agency_name: practice.name,
      provider_id: providerFor(client).id, note_type: 'PROGRESS_NOTE', note_kind: 'progress', service_code: '90834', status: 'draft',
      clinical_session_id: 990191 + index, office_event_id: 990141 + index,
      date_of_service: weekStart, created_at: `${weekStart}T16:00:00Z`, updated_at: `${weekStart}T17:00:00Z`,
      title: index === 1 ? 'Progress note · optional AI draft example' : 'Individual therapy progress note',
      input_text: `Fictional session example: ${sections(index).Subjective} ${sections(index).Interventions}`,
      output_json: outputFor(client, index, index === 1)
    };
  });
  const ratingsFor = client => [{
    id: 991000 + Number(client.id), objectiveId: 990163 + (Number(client.id) - 990121) * 10,
    goalIndex: 1, objectiveIndex: 1, goalText: client.goal || 'Build confidence using coping strategies.',
    objectiveText: client.objective || 'Use a grounding strategy independently when stress increases.',
    scaleStart: client.baseline || 3, scalePrevious: client.rating || 5, scaleValue: Math.min(client.target || 8, (client.rating || 5) + 1), scaleTarget: client.target || 8, disposition: 'rated',
    progressLabel: 'progressing', raterKind: 'clinician', raterLabel: 'Clinical observation', dateOfService: weekStart
  }];
  const historicalNotes = clients.map((client, index) => ({
    ...drafts[index % drafts.length], id: 990171 + index, client_id: client.id, client_full_name: clientName(client), initials: client.initials,
    date_of_service: previousDate, provider_id: providerFor(client).id, status: 'signed', provider_signed_at: `${previousDate}T17:00:00Z`,
    clinical_session_id: 990291 + index, office_event_id: 990241 + index,
    title: 'Progress note · fictional historical record', output_json: outputFor(client, index)
  }));
  const cosignNotes = DEMO_COSIGN_IDS.map((id, index) => {
    const client = clientFor(index + 3);
    return { ...drafts[index], id, client_id: client.id, client_full_name: clientName(client), initials: client.initials,
      provider_id: 990114, provider_signed_at: `${weekStart}T18:00:00Z`, status: 'signed', output_json: outputFor(client, index + 1),
      clinical_session_id: 990391 + index, office_event_id: 990341 + index, title: 'Progress note · awaiting Dr. Tessa Brooks’s co-signature' };
  });
  const signedSessions = historicalNotes.map(note => ({
    noteId: note.id, clientId: note.client_id, clientName: note.client_full_name, initials: note.initials,
    agencyId: practice.id, agencyName: practice.name, serviceCode: note.service_code, dateOfService: note.date_of_service,
    signedAt: note.provider_signed_at, officeEventId: note.office_event_id, clinicalSessionId: note.clinical_session_id
  }));
  const workQueue = drafts.map((draft, index) => ({
    id: `demo_work_${index + 1}`, serverId: 990401 + index, clientKey: `demo_work_${index + 1}`, draftId: draft.id,
    clientId: draft.client_id, clientName: draft.client_full_name, initials: draft.initials, agencyId: practice.id,
    agencyName: practice.name, organizationType: 'agency', agencyType: 'agency', serviceCode: '90834', noteKind: 'progress',
    action: 'Complete individual therapy progress note', date: weekStart, timeLabel: ['9:00 AM', '10:00 AM', '11:00 AM'][index],
    clinicalSessionId: draft.clinical_session_id, officeEventId: draft.office_event_id, status: 'started', docStatus: 'started'
  }));
  const allNotes = [...historicalNotes, ...cosignNotes];
  const detailFor = row => {
    const supervisor = cosignNotes.some(note => note.id === row.id);
    const client = clients.find(client => client.id === row.client_id);
    const provider = supervisor ? providers.find(provider => provider.id === 990114) || { id: 990114, name: 'Milo Chen', credential: 'LPCC' } : providerFor(client);
    return {
      ...row, agencyId: practice.id, clientId: row.client_id, clientName: row.client_full_name, noteType: row.note_type,
      serviceCode: row.service_code, dateOfService: row.date_of_service, clinicalSessionId: row.clinical_session_id,
      officeEventId: row.office_event_id, createdAt: row.created_at, providerSignedAt: row.provider_signed_at,
      providerSignedByUserId: provider.id, providerName: [providerName(provider), provider.credential || 'LPC'].join(', '),
      providerSigner: { id: provider.id, name: providerName(provider), credentials: provider.credential || 'LPC' },
      assignedSupervisor: { id: 990113, name: 'Dr. Tessa Brooks', credentials: 'PhD' },
      outputJson: row.output_json, content_json: { text: row.input_text }, structuredChart: row.output_json.meta.structuredChart,
      objectiveRatings: ratingsFor(client),
      durationMinutes: 45, locationLabel: 'Telehealth · client at home', startTime: '09:00', endTime: '09:45',
      serviceTimeZone: 'America/Denver', serviceLocationId: 990151, placeOfService: '10', isBillable: true,
      reviewSnapshotToken: `fictional-demo-snapshot-${row.id}`, canSuperviseReview: supervisor,
      clientPayer: { name: client.payer || 'Example Health Plan', memberId: 'DEMO-ONLY' }, primaryDiagnosis: diagnosisFor(client),
      linkedClaim: { statusLabel: 'Awaiting documentation review' }, addenda: [], reviewRequests: []
    };
  };
  function chartExtras(clientId) {
    const client = clients.find(row => Number(row.id) === Number(clientId));
    if (!client) return {};
    const index = Number(client.id) - 990121;
    const objectiveId = 990163 + index * 10;
    const diagnosis = diagnosisFor(client);
    return {
      diagnoses: diagnosis ? [{ id: 990160 + index * 10, icd10_code: diagnosis.icd10Code, description: diagnosis.description, is_primary: 1 }] : [],
      intakeNotes: [{ id: 990500 + index, status: 'final', finalized_at: `${previousDate}T17:00:00Z`, title: 'Fictional intake assessment' }],
      latestPlan: client.plan_status === 'To establish' ? null : {
        id: 990161 + index * 10, title: client.focus || 'Build confidence and strengthen coping strategies', status: 'active',
        effective_date: previousDate, created_at: `${previousDate}T16:00:00Z`, prescribed_frequency: 'Weekly individual therapy',
        diagnostic_justification: 'Fictional example: symptoms associated with a life transition interfere with coping and daily routines.',
        goals: [{ id: objectiveId - 1, goal_index: 1, goal_text: client.goal || 'Build confidence using coping strategies.', status: 'active', objectives: [{
          id: objectiveId, objective_index: 1, objective_text: client.objective || 'Use a grounding strategy independently when stress increases.', status: 'active', scale_start: client.baseline || 3, scale_current: client.rating || 5, scale_target: client.target || 8,
          scale_label_low: 'Needs full support', scale_label_high: 'Uses skills independently'
        }] }]
      },
      objectiveRatings: [{ objective_id: objectiveId, goal_id: objectiveId - 1, rater_kind: 'clinician', rater_label: 'clinical observation', scale_value: client.rating || 5, date_of_service: previousDate, disposition: 'rated', progress_label: 'progressing' }],
      notes: historicalNotes.filter(note => note.client_id === client.id), sessions: []
    };
  }
  function response(path, query = {}) {
    // The caller validates method and agency/client scope before dispatching here.
    if (path === '/clinical-notes/recent') return { drafts, signedSessions };
    if (path === '/clinical-notes/work-queue') return { items: workQueue };
    const appointment = path.match(/^\/clinical-notes\/drafts\/(\d+)\/appointment$/);
    if (appointment) {
      const draft = drafts.find(row => Number(row.id) === Number(appointment[1]));
      if (!draft) throw new Error('That draft is outside this fictional demo.');
      return { linked: true, options: [], context: { draftId: draft.id, clientId: draft.client_id,
        clinicalSessionId: draft.clinical_session_id, officeEventId: draft.office_event_id,
        agencyId: practice.id, serviceCode: draft.service_code, sourceTimezone: 'America/Denver',
        startAt: `${weekStart}T16:00:00Z`, endAt: `${weekStart}T16:45:00Z`, locationLabel: 'Telehealth · client at home' } };
    }
    if (path === '/medical-billing/notes/review-work') return { items: [] };
    if (path === '/me/notes-to-sign/count') return { count: cosignNotes.length, isSupervisor: true };
    if (path === '/me/notes-to-sign') return { isSupervisor: true, notes: cosignNotes.map(note => ({
      id: note.id, clinical_note_id: note.id, agency_id: practice.id, client_id: note.client_id,
      client_name: note.client_full_name, provider_user_id: 990114, provider_first_name: 'Milo', provider_last_name: 'Chen',
      supervisor_user_id: 990113, supervisor_name: 'Dr. Tessa Brooks', service_code: note.service_code,
      date_of_service: note.date_of_service, provider_signed_at: note.provider_signed_at
    })) };
    const detail = path.match(/^\/medical-billing\/notes\/(\d+)$/);
    if (detail) {
      const note = allNotes.find(row => Number(row.id) === Number(detail[1]));
      if (!note) throw new Error('That note is outside this fictional demo.');
      return { note: detailFor(note), session: { id: note.clinical_session_id, client_id: note.client_id, agency_id: practice.id, office_event_id: note.office_event_id } };
    }
    const review = path.match(/^\/supervision\/supervisee\/(\d+)\/document-reviews\/note\/(\d+)$/);
    if (review) {
      const note = cosignNotes.find(row => Number(row.id) === Number(review[2]));
      if (Number(review[1]) !== 990114 || !note) throw new Error('That review is outside this fictional demo.');
      return { contentHash: `fictional-demo-hash-${note.id}`, reviewSnapshotToken: `fictional-demo-snapshot-${note.id}`,
        content: { note: note.output_json, addenda: [] }, reviewSnapshot: detailFor(note), canCosign: true,
        canTrackCosignTime: false, cosignedAt: null, supervisorName: 'Dr. Tessa Brooks' };
    }
    const sessionData = path.match(/^\/clinical-data\/sessions\/(\d+)\/(artifacts|materials(?:\/recipients)?)$/);
    if (sessionData) {
      if (![...drafts, ...allNotes].some(note => Number(note.clinical_session_id) === Number(sessionData[1]))) throw new Error('That session is outside this fictional demo.');
      return sessionData[2] === 'artifacts' ? { notes: [], documents: [], claims: [] } : [];
    }
    if (path === '/medical-billing/service-locations') return {
      choices: [{ serviceLocationId: 990151, label: 'Telehealth · client at home', placeOfService: '10', aliases: ['Telehealth'] }],
      items: [{ id: 990151, name: 'Telehealth · client at home', place_of_service: '10', is_active: true }]
    };
    if (/^\/supervisor-assignments\/supervisee\/\d+$/.test(path)) return { assignments: path.includes('/990114') ? [{ supervisor_id: 990113, supervisor_first_name: 'Tessa', supervisor_last_name: 'Brooks', supervisor_type: 'clinical', is_primary: 1 }] : [] };
    return undefined;
  }
  return { drafts, historicalNotes, signedSessions, workQueue, cosignNotes, chartExtras, response };
}
