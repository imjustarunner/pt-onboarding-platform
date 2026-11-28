import { describe, expect, it, vi } from 'vitest';
import { fullProgressNoteRequiresSession, requireActualProgressSession } from '../clinicalProgressSessionGate.service.js';
import { clinicalServiceChangeSummary } from '../clinicalSessionServiceChange.service.js';

describe('full-workspace progress-note session entry', () => {
  it.each(['clinical_psychotherapy_note', 'clinical_family_note', 'clinical_h0004_note', 'clinical_h2011_note', 'clinical_h2014_individual', 'clinical_pcp_note', 'clinical_cs_note_build'])('requires a real session for %s',toolId=>{
    expect(fullProgressNoteRequiresSession({toolId})).toBe(true);
  });
  it.each(['clinical_psychotherapy_plan','clinical_h0004_plan','clinical_90791_intake_plan','clinical_h0031_intake','clinical_diagnosis_writer','clinical_termination','clinical_treatment_summary'])('preserves %s as a sessionless tool',toolId=>{
    expect(fullProgressNoteRequiresSession({toolId,serviceCode:'H0004'})).toBe(false);
  });
  it('requires session context when the initial draft carries a progress code before choosing a tool',()=>{
    expect(fullProgressNoteRequiresSession({serviceCode:'H0004'})).toBe(true);
    expect(fullProgressNoteRequiresSession({noteKind:'progress'})).toBe(true);
    expect(fullProgressNoteRequiresSession({serviceCode:'90791'})).toBe(false);
  });
  it('rejects client/date/initials entry without doing any same-day session search',async()=>{
    const resolveSession=vi.fn();
    await expect(requireActualProgressSession({clientId:5,dateOfService:'2026-11-15',serviceCode:'H0004'},{resolveSession})).rejects.toMatchObject({status:409,code:'NOTE_SESSION_CONTEXT_REQUIRED'});
    expect(resolveSession).not.toHaveBeenCalled();
  });
  it.each([{clinicalSessionId:10},{officeEventId:20}])('accepts a scoped real session resolved from explicit %j',async input=>{
    const session={id:10,appointment_id:30};const resolveSession=vi.fn(async()=>session);
    expect(await requireActualProgressSession(input,{resolveSession})).toBe(session);
    expect(resolveSession).toHaveBeenCalledWith(input);
  });
  it('rejects a legacy synthetic note-only encounter even if its numeric session ID is explicit',async()=>{
    const resolveSession=vi.fn(async()=>({id:10,metadata_json:'{"source":"note_aid_draft"}'}));
    await expect(requireActualProgressSession({clinicalSessionId:10},{resolveSession})).rejects.toMatchObject({status:409,code:'NOTE_SESSION_CONTEXT_REQUIRED'});
  });
  it.each(['cancelled','voided','no_show'])('does not turn a %s actual session into a new progress note',async encounter_status=>{
    const resolveSession=vi.fn(async()=>({id:10,appointment_id:30,encounter_status}));
    await expect(requireActualProgressSession({clinicalSessionId:10},{resolveSession})).rejects.toMatchObject({status:409});
  });
  it('exposes real source IDs and saved timing without inventing backing for an old synthetic session',()=>{
    const session={id:10,agency_id:6,client_id:22,source_timezone:'America/Denver',scheduled_start_at:'2026-11-16 02:30:00',scheduled_end_at:'2026-11-16 03:30:00'};
    expect(clinicalServiceChangeSummary(session)).toMatchObject({appointmentId:null,officeEventId:null,billingEncounterId:null,
      sourceTimezone:'America/Denver',scheduledStartAt:'2026-11-16T02:30:00.000Z',scheduledEndAt:'2026-11-16T03:30:00.000Z'});
    expect(clinicalServiceChangeSummary({...session,appointment_id:84})).toMatchObject({appointmentId:84});
  });
  it('preserves the booked telehealth setting without guessing video or audio', () => {
    const session = { id: 10, agency_id: 6, client_id: 22, place_of_service: '10',
      metadata_json: JSON.stringify({ locationLabel: 'Online at home' }) };
    expect(clinicalServiceChangeSummary(session)).toMatchObject({
      modality: 'telehealth', placeOfService: '10', locationLabel: 'Online at home'
    });
    expect(clinicalServiceChangeSummary({
      ...session, metadata_json: JSON.stringify({ scheduledAudioOnly: true })
    })).toMatchObject({ modality: 'phone', locationLabel: 'Telehealth' });
    expect(clinicalServiceChangeSummary({ id: 10, is_telehealth: null }).modality).toBe('');
  });

});
