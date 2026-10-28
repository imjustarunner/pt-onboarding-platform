import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
after(() => pool.end());
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
      draft_expires_at: '2099-08-11T12:00:00Z',
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


describe('retained unfinished enrollments', () => {
  it('distinguishes ended, expired, stopped, and missing-contact forms', () => {
    const agreed = { reminder_consent_status: 'agreed', has_session: 1, signer_email: 'parent@example.test' };
    assert.equal(resolveCurrentStage({ ...agreed, reminder_opt_out_at: '2026-01-01', has_session: 0 }), 'ended_without_submission');
    assert.equal(resolveCurrentStage({ ...agreed, draft_expires_at: '2020-01-01' }), 'access_expired');
    assert.equal(resolveCurrentStage({ ...agreed, reminder_opt_out_at: '2026-01-01' }), 'reminders_stopped');
    assert.equal(resolveCurrentStage({ ...agreed, has_session: 0 }), 'resume_unavailable');
    assert.equal(resolveCurrentStage({ ...agreed, signer_email: null }), 'missing_email');
  });
  it('shows a manual recovery send while reminders remain stopped and keeps tokens private', () => {
    const row = mapUnfinishedRow({ id: 22, has_session: 1, reminder_opt_out_at: '2026-10-27T18:00:00Z',
      signer_email: 'parent@example.test', reminder_consent_status: 'agreed', session_token: 'SECRET_TOKEN',
      intake_data: { clients: [{ firstName: 'Avery', lastName: 'Example' }], progressSnapshot: { savedAt: '2026-10-27T17:00:00Z', sessionToken: 'SECRET_TOKEN' }, clinicalAnswers: 'SECRET_CLINICAL' },
      notifications: [{ id: 55, template_type: 'enrollment_unfinished_reminder_manual', delivery_status: 'sent', sent_at: '2026-10-28T14:16:42Z' }] });
    assert.equal(row.currentStage, 'reminders_stopped'); assert.equal(row.resumeAvailable, true);
    assert.equal(row.lastNotifiedAt, '2026-10-28T14:16:42.000Z'); assert.deepEqual(row.childNames, ['Avery Example']);
    assert.ok(row.timeline.some(e => e.label === 'Support recovery email' && e.status === 'sent'));
    assert.doesNotMatch(JSON.stringify(row), /SECRET/);
  });
  it('does not call a queued or skipped email a sent notification', () => {
    const row = mapUnfinishedRow({ reminder_consent_status: 'agreed', reminder_24h_sent_at: '2026-01-01T00:00:00Z', reminder1_event_status: 'skipped', notifications: [{ id: 1, template_type: 'enrollment_unfinished_reminder_72h', delivery_status: 'pending' }] });
    assert.equal(row.lastNotifiedAt, null); assert.equal(row.reminder1SentAt, null);
  });
});
