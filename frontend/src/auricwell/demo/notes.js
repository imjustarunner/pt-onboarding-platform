import { demoClientRecordIds } from './recordIds.js';
import { narrivaExamples, examplePreviousRatings, exampleReviewInsights, exampleTreatmentHistory } from './narriva.js';
// Fictional browser-only examples. These records never reference production IDs.
export const DEMO_NOTE_NOTICE = 'Demo only: this does not sign or complete a note. Nothing is saved, submitted or sent.';
export const DEMO_DRAFT_IDS = [990131, 990132, 990133];
export const DEMO_COSIGN_IDS = [990181, 990182];

/** Fixed action names only: never derive an analytics label from clinical text. */
export function demoNoteAction(button) {
  const label = String(button?.textContent || '').replace(/\s+/g, ' ').trim();
  if (/^(?:quick sign|(?:run|refresh) narriva|run checks again|narriva generate note)/i.test(label)) return 'narriva';
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
  const exampleFor=client=>narrivaExamples.find(item=>item.clientId===Number(client?.id));
  const previousDate = dayBefore(weekStart);
  const clientFor = index => clients[index % clients.length];
  const clientName = client => client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ');
  const providerFor = client => providers.find(provider => Number(provider.id) === Number(client?.provider_id)) || actor;
  const providerName = provider => provider.full_name || provider.name || [provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Avery Lane';
  const diagnosisFor = client => {
    const example=exampleFor(client);
    if(example){const match=example.diagnosis.match(/([FZ]\d{2}(?:\.\d+)?)/);return match?{icd10Code:match[1],description:example.diagnosis}:null;}
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
  const outputFor = (client, index, aiGenerated = false) => {const example=exampleFor(client);if(example){const e=example.encounter;return {sections:Object.fromEntries(example.sections.map(section=>[section.label,section.text])),meta:{toolId:'clinical_psychotherapy_note',serviceCode:e.serviceCode,noteKind:'progress',manualSections:false,aiGenerated:true,exampleOnly:true,source:'prepared_demo',structuredChart:{clientId:client.id,durationMinutes:e.durationMinutes,locationLabel:e.locationDetail,startTime:e.startTimeLocal,endTime:e.endTimeLocal,riskAssessment:{patientDeniesAll:true,notes:e.riskSummary,exampleOnly:true},participants:e.participants,placeOfService:e.serviceCode==='90847'?'11':'10'},sessionContext:{sourceTimezone:'America/Denver',locationLabel:e.locationDetail,durationMinutes:e.durationMinutes,startTimeLocal:e.startTimeLocal,endTimeLocal:e.endTimeLocal,participants:e.participants,serviceCode:e.serviceCode,placeOfService:e.serviceCode==='90847'?'11':'10'},prescribedFrequency:'Weekly'}};}return ({
    sections: index < 8 ? sections(index) : {
      ...sections(index), Subjective: client.session_summary || sections(index).Subjective,
      Interventions: client.intervention_summary || sections(index).Interventions,
      Plan: client.next_steps || sections(index).Plan
    },
    meta: {
      toolId: 'clinical_psychotherapy_note', serviceCode: '90834', noteKind: 'progress', manualSections: !aiGenerated, aiGenerated,
      ...(aiGenerated ? { source: 'session_recording', recordingConsent: { status: 'consented', exampleOnly: true }, model: 'Illustrative consented transcript example' } : {}),
      structuredChart: structuredChart(client),
      sessionContext: { sourceTimezone: 'America/Denver', locationLabel: 'Telehealth · client at home', durationMinutes: 45, startTimeLocal: '09:00', endTimeLocal: '09:45', participants: 'Client Only', serviceCode: '90834', serviceLocationId: 990151, placeOfService: '10' },
      prescribedFrequency: index < 8 ? 'Weekly individual therapy' : client.frequency, treatmentRecommendation: 'continue'
    }
  });
  };
  const drafts = DEMO_DRAFT_IDS.map((id, index) => {
    const client = clientFor(index);
    return {
      id, client_id: client.id, client_full_name: clientName(client), initials: client.initials,
      agency_id: practice.id, client_agency_id: practice.id, agency_name: practice.name,
      provider_id: providerFor(client).id, note_type: 'PROGRESS_NOTE', note_kind: 'progress', service_code: exampleFor(client)?.encounter.serviceCode || '90834', status: 'draft',
      clinical_session_id: 990191 + index, office_event_id: 990141 + index,
      date_of_service: weekStart, created_at: `${weekStart}T16:00:00Z`, updated_at: `${weekStart}T17:00:00Z`,
      title: exampleFor(client)?.encounter.serviceCode==='90847'?'Couples therapy progress note':'Narriva progress note · prepared example',
      input_text: exampleFor(client)?.source || `Fictional session example: ${sections(index).Subjective} ${sections(index).Interventions}`,
      output_json: outputFor(client, index, index === 1)
    };
  });
  const ratingsFor = client => exampleFor(client)?examplePreviousRatings(exampleFor(client)).filter(row=>row.rater_kind==='clinician').map(row=>{const goal=exampleFor(client).plan.goals.find(g=>g.objectives.some(o=>o.id===row.objective_id)),objective=goal.objectives.find(o=>o.id===row.objective_id);return {objectiveId:row.objective_id,goalIndex:goal.goal_index,objectiveIndex:objective.objective_index,goalText:goal.goal_text,objectiveText:objective.objective_text,scaleStart:objective.scale_start,scalePrevious:objective.scale_start,scaleValue:row.scale_value,scaleTarget:objective.scale_target,raterKind:row.rater_kind,raterLabel:'Clinical observation',dateOfService:previousDate,disposition:'rated',progressLabel:'unchanged',exampleOnly:true};}):[{
    id: 991000 + Number(client.id), objectiveId: demoClientRecordIds(client.id).objectiveId,
    goalIndex: 1, objectiveIndex: 1, goalText: client.goal || 'Build confidence using coping strategies.',
    objectiveText: client.objective || 'Use a grounding strategy independently when stress increases.',
    scaleStart: client.baseline || 3, scalePrevious: client.rating || 5, scaleValue: Math.min(client.target || 8, (client.rating || 5) + 1), scaleTarget: client.target || 8, disposition: 'rated',
    progressLabel: 'progressing', raterKind: 'clinician', raterLabel: 'Clinical observation', dateOfService: weekStart
  }];
  const historicalNotes = clients.map((client, index) => {
    const ids = demoClientRecordIds(client.id), output = outputFor(client, index);
    const date = index < 8 ? previousDate : client.last_date || previousDate;
    return {
      ...drafts[index % drafts.length], id: ids.historyNoteId, client_id: client.id, client_full_name: clientName(client), initials: client.initials,
      date_of_service: date, provider_id: providerFor(client).id, status: 'signed', provider_signed_at: `${date}T17:00:00Z`,
      clinical_session_id: ids.historySessionId, office_event_id: ids.historyOfficeEventId,
      title: 'Progress note · fictional historical record', output_json: output,
      ...(index >= 8 ? { created_at: `${date}T16:00:00Z`, updated_at: `${date}T17:00:00Z` } : {}),
      input_text: index < 8 ? drafts[index % drafts.length].input_text : `Fictional historical session: ${output.sections.Subjective} ${output.sections.Interventions}`
    };
  });
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
    agencyName: practice.name, organizationType: 'agency', agencyType: 'agency', serviceCode: draft.service_code, noteKind: 'progress',
    action: 'Review prepared progress note', date: weekStart, timeLabel: ['9:00 AM', '10:00 AM', '11:00 AM'][index],
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
    const ids = demoClientRecordIds(client.id);
    const objectiveId = ids.objectiveId;
    const diagnosis = diagnosisFor(client);
    const example=exampleFor(client);
    return {
      diagnoses: diagnosis ? [{ id: ids.diagnosisId, icd10_code: diagnosis.icd10Code, description: diagnosis.description, is_primary: 1 }] : [],
      intakeNotes: [{ id: ids.intakeNoteId, status: 'final', finalized_at: `${previousDate}T17:00:00Z`, title: 'Fictional intake assessment' }],
      latestPlan: client.plan_status === 'To establish' ? null : example?{...example.plan,id:ids.planId,status:'active',effective_date:previousDate,created_at:`${previousDate}T16:00:00Z`,prescribed_frequency:'Weekly',exampleOnly:true}:{
        id: ids.planId, title: client.focus || 'Build confidence and strengthen coping strategies', status: 'active',
        effective_date: previousDate, created_at: `${previousDate}T16:00:00Z`, prescribed_frequency: client.frequency || 'Weekly individual therapy',
        diagnostic_justification: 'Fictional example: symptoms associated with a life transition interfere with coping and daily routines.',
        goals: [{ id: objectiveId - 1, goal_index: 1, goal_text: client.goal || 'Build confidence using coping strategies.', status: 'active', objectives: [{
          id: objectiveId, objective_index: 1, objective_text: client.objective || 'Use a grounding strategy independently when stress increases.', status: 'active', scale_start: client.baseline || 3, scale_current: client.rating || 5, scale_target: client.target || 8,
          scale_label_low: 'Needs full support', scale_label_high: 'Uses skills independently'
        }] }]
      },
      objectiveRatings: example?examplePreviousRatings(example).map(row=>({...row,date_of_service:previousDate})):[{ objective_id: objectiveId, goal_id: objectiveId - 1, rater_kind: 'clinician', rater_label: 'clinical observation', scale_value: client.rating || 5, date_of_service: previousDate, disposition: 'rated', progress_label: 'progressing' }],
      notes: historicalNotes.filter(note => note.client_id === client.id),
      sessions: historicalNotes.filter(note => note.client_id === client.id).map(note => ({
        id: note.clinical_session_id, client_id: client.id, agency_id: practice.id, provider_id: providerFor(client).id,
        office_event_id: note.office_event_id, date_of_service: note.date_of_service, status: 'completed',
        service_code: note.service_code, modality: note.output_json.meta.sessionContext.placeOfService === '10' ? 'VIRTUAL' : 'IN_PERSON',
        duration_minutes: note.output_json.meta.structuredChart.durationMinutes, note_id: note.id, documentation_status: 'signed'
      }))
    };
  }
  function response(path, query = {}) {
    // The caller validates method and agency/client scope before dispatching here.
    if (path === '/clinical-notes/recent') return { drafts, signedSessions };
    if (path === '/clinical-notes/work-queue') return { items: workQueue };
    if (path === '/narriva/preferences') return { defaultMode:'manual', features:{writing:true,compliance:true,quickSign:true,recording:false} };
    const insights=path.match(/^\/narriva\/notes\/(\d+)\/review-insights$/);
    if(insights){
      const note=allNotes.find(row=>Number(row.id)===Number(insights[1]));if(!note)throw new Error('That note is outside this fictional demo.');
      const client=clients.find(row=>row.id===note.client_id),plan=chartExtras(client.id).latestPlan;
      const history=exampleTreatmentHistory({example:{plan:plan||{goals:[]}},ratings:ratingsFor(client),lastDate:note.date_of_service});
      return {insights:exampleReviewInsights(note.id,practice.id,Object.entries(note.output_json.sections).map(([key,text])=>({key,label:key,text})),history)};
    }
    const service=path.match(/^\/narriva\/sessions\/(\d+)\/service$/);
    if(service){const note=[...drafts,...allNotes].find(row=>Number(row.clinical_session_id)===Number(service[1]));if(!note)throw new Error('That session is outside this fictional demo.');return {session:{id:note.clinical_session_id,serviceCode:note.service_code},serviceCode:note.service_code};}
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
      date_of_service: note.date_of_service, provider_signed_at: note.provider_signed_at,
      narriva:{reviewId:'fictional-retained-example',exampleOnly:true,quickSignEligible:note.id===DEMO_COSIGN_IDS[0]}
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
