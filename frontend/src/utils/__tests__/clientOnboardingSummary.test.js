import { describe, expect, it } from 'vitest';
import { formatOnboardingSummary } from '../clientOnboardingSummary.js';

describe('formatOnboardingSummary fall pending', () => {
  it('uses API onboarding.summary_label when present', () => {
    expect(
      formatOnboardingSummary({
        client_status_key: 'current',
        onboarding: { summary_label: 'Fall pending' }
      })
    ).toBe('Fall pending');
  });

  it('does not show Readiness complete for Current without weekday', () => {
    const label = formatOnboardingSummary({
      client_type: 'school',
      client_status_key: 'current',
      service_day: null,
      staff_onboarding_completed_at: '2026-04-01',
      submission_date: '2026-03-05',
      organization_id: 10
    });
    expect(label    ).toBe('Fall confirmation pending');
    expect(label).not.toBe('Readiness complete');
  });

  it('shows Fall confirmation complete when weekday + continue plan', () => {
    expect(
      formatOnboardingSummary({
        client_type: 'school',
        client_status_key: 'current',
        service_day: 'Monday',
        staff_onboarding_completed_at: '2026-04-01',
        submission_date: '2026-03-05',
        organization_id: 10,
        continuation_services_json: {
          plan: 'continue_school',
          serviceDays: ['Monday']
        }
      })
    ).toBe('Fall confirmation complete');
  });

  it('shows Terminated for not continuing', () => {
    expect(
      formatOnboardingSummary({
        client_type: 'school',
        client_status_key: 'terminated',
        staff_onboarding_completed_at: '2026-04-01',
        submission_date: '2026-03-05',
        continuation_services_json: {
          plan: 'not_continue_school',
          privateComment: 'declined'
        }
      })
    ).toBe('Terminated');
  });
});
