import { expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({
  name: 'ITSCO', slug: 'itsco', logo_url: 'https://assets.example/itsco.png',
  onboarding_team_email: 'private@example.test', custom_parameters: { secret: 'private' }
}) } }));
import { interviewApplicantDetails } from '../interviewApplicantDetails.service.js';
it('returns only public branding and the actual interview schedule', async () => {
  const result = await interviewApplicantDetails({
    event: { agency_id: 4, start_at: '2026-11-13 18:00:00', end_at: '2026-11-13 19:00:00', private_notes: 'Do not expose' },
    interview: { interview_timezone: 'America/Denver', private_notes_json: { 7: 'Private assessment' } }
  });
  expect(result).toEqual({ agency: { name: 'ITSCO', slug: 'itsco', logoUrl: 'https://assets.example/itsco.png' },
    meeting: { startsAt: '2026-11-13 18:00:00', endsAt: '2026-11-13 19:00:00', timezone: 'America/Denver' } });
});
