import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFallReadinessSummary,
  hasCompletedFallContinuation,
  isReturningSchoolClient,
  normalizeContinuationServicesPayload
} from '../fallReadiness.js';

describe('normalizeContinuationServicesPayload', () => {
  it('requires service days for continue_school and does not require a start date', () => {
    const out = normalizeContinuationServicesPayload({
      plan: 'continue_school',
      serviceDays: ['monday', 'Wednesday']
    });
    assert.equal(out.plan, 'continue_school');
    assert.deepEqual(out.serviceDays, ['Monday', 'Wednesday']);
    assert.equal(out.continuationStartDate, undefined);
  });

  it('rejects continue_school without days', () => {
    assert.throws(
      () => normalizeContinuationServicesPayload({ plan: 'continue_school', serviceDays: [] }),
      /assigned day/
    );
  });

  it('supports other plan with private comment and recommendTerminate', () => {
    const out = normalizeContinuationServicesPayload({
      plan: 'other',
      privateComment: 'Need help finding family',
      supportFollowUp: true,
      removeFromAssignment: false,
      recommendTerminate: false
    });
    assert.equal(out.plan, 'other');
    assert.equal(out.privateComment, 'Need help finding family');
    assert.equal(out.supportFollowUp, true);
    assert.equal(out.recommendTerminate, false);
  });

  it('forces terminate for not_continue_school', () => {
    const out = normalizeContinuationServicesPayload({
      plan: 'not_continue_school',
      privateComment: 'Family declined'
    });
    assert.equal(out.recommendTerminate, true);
  });

  it('maps legacy unableToContactRecommendation to recommendTerminate', () => {
    const out = normalizeContinuationServicesPayload({
      plan: 'unable_to_contact_parent',
      unableToContactRecommendation: 'recommend_terminate'
    });
    assert.equal(out.recommendTerminate, true);
    assert.match(out.privateComment, /Unable to contact/);
  });
});

describe('hasCompletedFallContinuation', () => {
  it('treats days-only continue as complete', () => {
    assert.equal(
      hasCompletedFallContinuation({ plan: 'continue_school', serviceDays: ['Friday'] }),
      true
    );
  });

  it('treats other with comment as complete', () => {
    assert.equal(
      hasCompletedFallContinuation({ plan: 'other', privateComment: 'note' }),
      true
    );
  });
});

describe('isReturningSchoolClient / computeFallReadinessSummary', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('detects pre-July school clients as returning', () => {
    assert.equal(
      isReturningSchoolClient(
        {
          client_type: 'school',
          client_status_key: 'current',
          submission_date: '2026-03-05',
          staff_onboarding_completed_at: '2026-04-01'
        },
        now
      ),
      true
    );
  });

  it('labels no-weekday returning clients as Fall pending', () => {
    const summary = computeFallReadinessSummary({
      returning: true,
      hasWeekday: false,
      statusKey: 'current',
      continuationJson: null
    });
    assert.equal(summary.summary_label, 'Fall pending');
    assert.equal(summary.fall_pending, true);
  });

  it('does not call Current without weekday Readiness complete', () => {
    const summary = computeFallReadinessSummary({
      returning: true,
      hasWeekday: false,
      statusKey: 'current',
      continuationJson: { plan: 'continue_school', serviceDays: [] }
    });
    assert.notEqual(summary.summary_label, 'Readiness complete');
    assert.equal(summary.fall_pending, true);
  });

  it('marks Fall readiness complete when continuing with a weekday', () => {
    const summary = computeFallReadinessSummary({
      returning: true,
      hasWeekday: true,
      statusKey: 'current',
      continuationJson: { plan: 'continue_school', serviceDays: ['Monday'] }
    });
    assert.equal(summary.summary_label, 'Fall readiness complete');
    assert.equal(summary.fall_complete, true);
  });
});
