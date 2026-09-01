import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMedicalRecordSources } from '../medicalRecordTimeline.service.js';

describe('mergeMedicalRecordSources', () => {
  it('keeps calendar sessions without billing and attaches later billing on same date+code', () => {
    const sessions = [
      {
        id: 10,
        client_id: 5,
        agency_id: 2,
        service_code: '90837',
        scheduled_start_at: '2026-06-11 10:00:00',
        office_event_id: 44
      }
    ];
    const officeEvents = [
      {
        id: 44,
        client_id: 5,
        service_code: '90837',
        start_at: '2026-06-11 10:00:00',
        clinical_session_id: 10,
        first_name: 'Michael',
        last_name: 'Mendez'
      }
    ];
    const unbilled = mergeMedicalRecordSources({ billing: [], sessions, officeEvents });
    assert.equal(unbilled.length, 1);
    assert.equal(unbilled[0].billing_attached, false);
    assert.equal(unbilled[0].service_code, '90837');
    assert.equal(unbilled[0].clinical_session_id, 10);

    const billing = [
      {
        id: 99,
        client_id: 5,
        service_date: '2026-06-11',
        service_code: '90837',
        diagnosis_text: 'F41.1'
      }
    ];
    const merged = mergeMedicalRecordSources({ billing, sessions, officeEvents });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].billing_attached, true);
    assert.equal(merged[0].billing_encounter_id, 99);
    assert.equal(merged[0].clinical_session_id, 10);
    assert.equal(merged[0].office_event_id, 44);
  });

  it('keeps calendar appointments that have a date even without a service code', () => {
    const officeEvents = [
      {
        id: 88,
        client_id: 5,
        start_at: '2026-05-07 09:00:00'
      }
    ];
    const rows = mergeMedicalRecordSources({ billing: [], sessions: [], officeEvents });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].service_code, 'SESSION');
    assert.equal(rows[0].office_event_id, 88);
  });
});
