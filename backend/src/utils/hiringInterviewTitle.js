import { roundLabelForKey } from '../constants/hiringInterviewRounds.js';

/**
 * Build calendar/display title: "{Round} — {Candidate} — {Job}".
 */
export function buildHiringInterviewTitle({
  interviewRound = 'initial',
  roundLabelCustom = '',
  candidateName = '',
  jobTitle = ''
} = {}) {
  const roundPart = roundLabelForKey(interviewRound, roundLabelCustom) || 'Interview';
  const candidatePart = String(candidateName || '').trim();
  const jobPart = String(jobTitle || '').trim();
  const parts = [roundPart];
  if (candidatePart) parts.push(candidatePart);
  if (jobPart) parts.push(jobPart);
  return parts.join(' — ');
}
