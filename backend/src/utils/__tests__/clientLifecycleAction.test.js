import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLifecycleAction, needsInsuranceClearance } from '../clientLifecycleAction.js';

describe('deriveLifecycleAction', () => {
  it('returns agency intake for received status', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'received' },
      viewerRole: 'admin'
    });
    assert.equal(action?.actionKey, 'agency_intake');
  });

  it('returns null for school_staff', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'received' },
      viewerRole: 'school_staff'
    });
    assert.equal(action, null);
  });

  it('returns spring update for providers', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'spring_update_pending' },
      viewerRole: 'provider'
    });
    assert.equal(action?.actionKey, 'spring_update');
  });

  it('returns fall confirmation Action Needed for providers on confirmation_pending', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'confirmation_pending' },
      viewerRole: 'provider'
    });
    assert.equal(action?.actionKey, 'fall_confirmation');
    assert.match(action.label, /Fall confirmation/i);
  });

  it('does not require agency clearance for confirmation_pending (e.g. MilLop other/remove)', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmation_pending',
        agency_roi_expired: true,
        disclosure_required: true,
        continuation_services_json: {
          plan: 'other',
          otherReasonKey: 'patient_discontinued_services',
          removeFromAssignment: true
        }
      },
      viewerRole: 'admin'
    });
    assert.equal(action, null);
  });

  it('drops agency clearance when recommend terminate is set', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'current',
        disclosure_required: true,
        continuation_services_json: {
          plan: 'other',
          recommendTerminate: true
        }
      },
      viewerRole: 'support'
    });
    assert.equal(action, null);
  });

  it('returns non-blocking ROI followup when ROI expired and clearance already done', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'ready_to_schedule',
        agency_roi_expired: true,
        disclosure_required: false
      },
      viewerRole: 'support',
      disposition: {
        agency_cleared_at: '2026-08-01T00:00:00.000Z',
        agency_clearance_json: { disclosureOk: true, insuranceOk: true }
      }
    });
    assert.equal(action?.actionKey, 'roi_followup');
    assert.match(action.label, /ROI/i);
  });

  it('does not require disclosure check for continuing school clients', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmed_returning',
        client_type: 'school',
        disclosure_required: true,
        agency_roi_expired: false
      },
      viewerRole: 'admin',
      now: new Date('2026-08-20T12:00:00')
    });
    assert.equal(action?.actionKey, 'agency_clearance');
    assert.equal(action?.label, 'Insurance check');
  });

  it('skips insurance check for continuing clients through 8/16 override', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmed_returning',
        client_type: 'school',
        disclosure_required: false,
        agency_roi_expired: false
      },
      viewerRole: 'admin',
      now: new Date('2026-08-12T12:00:00')
    });
    assert.equal(action, null);
  });

  it('returns provider disclosure check when disclosure_required for new intake', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'ready_to_schedule',
        client_type: 'school',
        disclosure_required: true,
        agency_roi_expired: false
      },
      viewerRole: 'admin'
    });
    assert.equal(action?.actionKey, 'agency_clearance');
    assert.equal(action?.label, 'Provider disclosure check');
  });

  it('returns assign-day for provider and agency when provider is assigned without a weekday', () => {
    const client = {
      client_status_key: 'needs_day_assignment',
      has_provider: true,
      has_weekday: false
    };
    const providerAction = deriveLifecycleAction({ client, viewerRole: 'provider' });
    assert.equal(providerAction?.actionKey, 'assign_day');
    const agencyAction = deriveLifecycleAction({ client, viewerRole: 'admin' });
    assert.equal(agencyAction?.actionKey, 'assign_day');
  });

  it('returns new client action for ready_to_schedule even without a weekday', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'ready_to_schedule', has_provider: true, has_weekday: false },
      viewerRole: 'provider'
    });
    assert.equal(action?.actionKey, 'assign_day');
  });

  it('keeps new scheduled clients on the new-client checklist, not Being Seen', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'scheduled', client_type: 'school', has_weekday: true, service_day: 'Monday' },
      viewerRole: 'provider'
    });
    assert.equal(action?.actionKey, 'provider_intake');
  });

  it('gives returners a Being Seen action once scheduled even if last year had first service', () => {
    const action = deriveLifecycleAction({
      client: {
        client_type: 'school',
        client_status_key: 'scheduled',
        staff_onboarding_completed_at: '2026-04-01',
        first_service_at: '2026-02-10',
        services_started_at: '2026-02-10',
        school_year: '2026-2027',
        has_weekday: true,
        service_day: 'Monday'
      },
      viewerRole: 'provider',
      now: new Date('2026-08-20T12:00:00')
    });
    assert.equal(action?.actionKey, 'confirm_services_started');
    assert.match(action.label, /Being Seen/i);
  });

  it('hides Being Seen action after the provider confirms this year', () => {
    const action = deriveLifecycleAction({
      client: {
        client_type: 'school',
        client_status_key: 'scheduled',
        staff_onboarding_completed_at: '2026-04-01',
        services_started_at: '2026-08-18',
        first_service_at: '2026-02-10',
        has_weekday: true,
        service_day: 'Monday'
      },
      viewerRole: 'provider',
      now: new Date('2026-08-20T12:00:00')
    });
    assert.equal(action, null);
  });

  it('gives Mark Being Seen when leftover last-year Being Seen is still on a weekday', () => {
    const action = deriveLifecycleAction({
      client: {
        client_type: 'school',
        client_status_key: 'being_seen',
        staff_onboarding_completed_at: '2026-04-01',
        services_started_at: '2026-02-10',
        first_service_at: '2026-02-10',
        service_day: 'Tuesday'
      },
      viewerRole: 'provider',
      now: new Date('2026-08-17T12:00:00')
    });
    assert.equal(action?.actionKey, 'confirm_services_started');
  });

  it('does not ask providers for fall confirmation when a weekday is already assigned', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmation_pending',
        has_provider: true,
        has_weekday: true,
        service_day: 'Friday'
      },
      viewerRole: 'provider'
    });
    assert.equal(action, null);
  });

  it('hides provider fall confirmation for unassigned clients', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'confirmation_pending', has_provider: false },
      viewerRole: 'provider'
    });
    assert.equal(action, null);
  });

  it('does not show New Client intake for returning ready_to_schedule with a day', () => {
    const action = deriveLifecycleAction({
      client: {
        client_type: 'school',
        client_status_key: 'ready_to_schedule',
        school_year: '2025-2026',
        has_weekday: true,
        service_day: 'Friday',
        staff_onboarding_completed_at: '2026-04-01'
      },
      viewerRole: 'provider'
    });
    assert.equal(action, null);
  });

  it('asks providers for fall confirmation when a returner is ready to schedule with no day', () => {
    const action = deriveLifecycleAction({
      client: {
        client_type: 'school',
        client_status_key: 'ready_to_schedule',
        school_year: '2026-2027',
        has_provider: true,
        has_weekday: false,
        staff_onboarding_completed_at: '2026-04-01'
      },
      viewerRole: 'provider'
    });
    assert.equal(action?.actionKey, 'fall_confirmation');
  });

  it('does not ask providers for fall confirmation after it is already completed', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'current', client_type: 'school', has_provider: true, has_weekday: false },
      viewerRole: 'provider',
      disposition: { fall_completed_at: '2026-08-01T00:00:00.000Z' }
    });
    assert.equal(action?.actionKey, 'assign_day');
  });

  it('hides flashy fall confirmation after a non-returning submission and offers a quiet Update', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmation_pending',
        has_provider: true,
        has_weekday: false
      },
      viewerRole: 'provider',
      disposition: {
        fall_completed_at: '2026-08-13T00:00:00.000Z',
        fall_outcome: 'unable_to_reach'
      }
    });
    assert.equal(action?.actionKey, 'fall_confirmation');
    assert.equal(action?.label, 'Update');
    assert.equal(action?.quiet, true);
  });

  it('does not offer fall confirmation update after confirmed returning or terminate', () => {
    const confirmed = deriveLifecycleAction({
      client: {
        client_status_key: 'confirmation_pending',
        has_provider: true,
        has_weekday: false
      },
      viewerRole: 'provider',
      disposition: {
        fall_completed_at: '2026-08-13T00:00:00.000Z',
        fall_outcome: 'confirmed_returning'
      }
    });
    assert.equal(confirmed, null);
    const terminated = deriveLifecycleAction({
      client: {
        client_status_key: 'terminated',
        has_provider: true
      },
      viewerRole: 'provider',
      disposition: {
        fall_completed_at: '2026-08-13T00:00:00.000Z',
        fall_outcome: 'recommend_termination'
      }
    });
    assert.equal(terminated, null);
  });

  it('still counts insurance clearance during the continuing-client override window', () => {
    const client = {
      client_status_key: 'current',
      client_type: 'school',
      insurance_cleared: false
    };
    assert.equal(needsInsuranceClearance({ client, ignoreOverride: false, now: new Date('2026-08-12T12:00:00Z') }), false);
    assert.equal(needsInsuranceClearance({ client, ignoreOverride: true, now: new Date('2026-08-12T12:00:00Z') }), true);
  });

  it('allows insurance clearance while waiting on provider fall confirmation', () => {
    const client = {
      client_status_key: 'confirmation_pending',
      client_type: 'school',
      insurance_cleared: false
    };
    assert.equal(needsInsuranceClearance({ client, ignoreOverride: true }), true);
    const agencyAction = deriveLifecycleAction({
      client,
      viewerRole: 'admin'
    });
    assert.equal(agencyAction?.actionKey, 'agency_clearance');
    assert.equal(agencyAction?.label, 'Insurance check');
    const providerAction = deriveLifecycleAction({
      client: { ...client, has_provider: true, has_weekday: false },
      viewerRole: 'provider'
    });
    assert.equal(providerAction?.actionKey, 'fall_confirmation');
  });

  it('returns fall reassignment when provider pushed back and clearance pending', () => {
    const action = deriveLifecycleAction({
      client: {
        client_status_key: 'ready_to_schedule',
        client_type: 'school',
        has_provider: true,
        has_weekday: true,
        service_day: 'Monday'
      },
      viewerRole: 'admin',
      disposition: {
        fall_outcome: 'unable_to_reach',
        fall_completed_at: '2026-08-13T00:00:00.000Z',
        fall_remove_from_assignment: 1,
        agency_cleared_at: null
      }
    });
    assert.equal(action?.actionKey, 'fall_reassignment');
    assert.match(action?.label, /Fall reassignment/i);
  });

  it('skips insurance clearance when agency intake already reviewed insurance', () => {
    const client = {
      client_status_key: 'ready_to_schedule',
      client_type: 'school',
      disclosure_required: false,
      agency_intake_json: { insuranceReviewed: true, ehrTransferred: true, agencyIntakeComplete: true }
    };
    assert.equal(needsInsuranceClearance({ client, ignoreOverride: true }), false);
    const action = deriveLifecycleAction({ client, viewerRole: 'admin' });
    assert.equal(action, null);
  });

  it('returns waitlist resolution for waitlisted agency users', () => {
    const action = deriveLifecycleAction({
      client: { client_status_key: 'waitlist', client_type: 'school' },
      viewerRole: 'admin'
    });
    assert.equal(action?.actionKey, 'waitlist_resolution');
    assert.match(action?.label, /Waitlist/i);
  });
});
