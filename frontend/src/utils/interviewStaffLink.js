// Staff stay on their authenticated origin. Candidate links never substitute
// for a missing staff link, and staff entry never falls back to guest identity.
export function interviewStaffLink(interview) {
  if (!interview?.host_join_url) return null;
  try {
    const url = new URL(interview.host_join_url, 'https://plotlinepo.com');
    if (!/^\/interview\/[^/]+\/video\/[^/]+$/.test(url.pathname)) return null;
    url.searchParams.set('staff', '1');
    return url.pathname + url.search;
  } catch { return null; }
}
