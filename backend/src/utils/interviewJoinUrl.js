export const INTERVIEW_ORIGIN = 'https://plotlinepo.com';

export function interviewJoinUrl(slug, token) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || '')) || !String(token || '').trim()) return null;
  return `${INTERVIEW_ORIGIN}/interview/${slug}/video/${encodeURIComponent(token)}`;
}

export function interviewRsvpUrl(joinUrl) {
  if (String(joinUrl).startsWith('#')) return '#interview-rsvp-added-when-scheduled';
  const url = new URL(joinUrl);
  const token = /\/(?:join\/team-meeting|interview\/[^/]+\/video)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  if (!token) throw new Error('Invalid interview URL.');
  url.pathname = `/interview-rsvp/${token}`;
  url.search = ''; url.hash = '';
  return url.toString();
}
