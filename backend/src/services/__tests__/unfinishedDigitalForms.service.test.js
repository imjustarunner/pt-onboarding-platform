import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeReportScope,
  resolveRowScope,
  resolveCurrentStage,
  isEnrollmentPacketFormType,
  mapUnfinishedRow
} from '../unfinishedDigitalForms.service.js';

describe('unfinishedDigitalForms helpers', () => {
  it('normalizes scope', () => {
    assert.equal(normalizeReportScope('school'), 'school');
    assert.equal(normalizeReportScope('OFFICE'), 'office');
    assert.equal(normalizeReportScope(''), 'all');
    assert.equal(normalizeReportScope('weird'), 'all');
  });

  it('resolves school vs office scope from link flags', () => {
    assert.equal(resolveRowScope({ scope_type: 'school' }), 'school');
    assert.equal(resolveRowScope({ scope_type: 'program' }), 'school');
    assert.equal(resolveRowScope({ scope_type: 'agency', inherits_school_master: 1 }), 'school');
    assert.equal(resolveRowScope({ scope_type: 'agency', inherits_office_master: 1 }), 'office');
    assert.equal(resolveRowScope({ scope_type: 'agency' }), 'office');
  });

  it('resolves reminder currentStage', () => {
    assert.equal(resolveCurrentStage({}), 'awaiting_consent');
    assert.equal(resolveCurrentStage({ reminder_consent_status: 'declined' }), 'declined_no_reminders');
    assert.equal(resolveCurrentStage({ reminder_consent_status: 'agreed' }), 'in_reminder_sequence');
    assert.equal(
      resolveCurrentStage({
        reminder_consent_status: 'agreed',
        reminder_24h_sent_at: '2026-01-01T00:00:00Z'
      }),
      'reminder_1_sent'
    );
    assert.equal(
      resolveCurrentStage({
        reminder_consent_status: 'agreed',
        reminder_24h_sent_at: '2026-01-01T00:00:00Z',
        reminder_72h_sent_at: '2026-01-02T00:00:00Z',
        reminder_7d_sent_at: '2026-01-05T00:00:00Z'
      }),
      'reminder_3_sent'
    );
  });

  it('includes enrollment packets and excludes interest/job forms', () => {
    assert.equal(isEnrollmentPacketFormType('intake'), true);
    assert.equal(isEnrollmentPacketFormType('public_form'), true);
    assert.equal(isEnrollmentPacketFormType(null), true);
    assert.equal(isEnrollmentPacketFormType('job_application'), false);
    assert.equal(isEnrollmentPacketFormType('smart_registration'), false);
    assert.equal(isEnrollmentPacketFormType('medical_records_request'), false);
  });

  it('maps flat CSV-friendly rows without secrets', () => {
    const mapped = mapUnfinishedRow({
      id: 42,
      reminder_first_name: 'Alex',
      signer_name: 'Alex Rivera',
      signer_email: 'Alex@Example.com',
      school_name: 'Ashley Elementary',
      school_organization_id: 9,
      scope_type: 'school',
      form_type: 'intake',
      link_title: 'Digital Enrollment Packet',
      created_at: '2026-08-01T12:00:00Z',
      draft_expires_at: '2026-08-11T12:00:00Z',
      reminder_consent_status: 'agreed',
      reminder_consent_at: '2026-08-01T12:05:00Z',
      reminder_24h_sent_at: '2026-08-02T12:05:00Z',
      reminder1_event_status: 'sent',
      session_token: 'SECRET',
      deletion_token_hash: 'HASH'
    });
    assert.equal(mapped.id, 42);
    assert.equal(mapped.displayName, 'Alex');
    assert.equal(mapped.email, 'alex@example.com');
    assert.equal(mapped.schoolName, 'Ashley Elementary');
    assert.equal(mapped.scope, 'school');
    assert.equal(mapped.reminder1Status, 'sent');
    assert.equal(mapped.currentStage, 'reminder_1_sent');
    assert.ok(Array.isArray(mapped.timeline));
    assert.equal(mapped.session_token, undefined);
    assert.equal(mapped.deletion_token_hash, undefined);
  });
});
