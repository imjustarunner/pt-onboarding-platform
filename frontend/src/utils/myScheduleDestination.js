/** Retain bookmarked appointment/day links while using the dashboard calendar. */
export function myScheduleDestination(to) {
  const slug = String(to.params?.organizationSlug || '');
  return { path: `${slug ? `/${encodeURIComponent(slug)}` : ''}/dashboard`,
    query: { ...to.query, tab: 'my_schedule' }, hash: to.hash || '' };
}
