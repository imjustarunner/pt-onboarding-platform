import { getMyDashboardPath } from './router';

/** Always open the tabbed My Dashboard Log Time panel (never /admin). */
export function goToLogTime(router, route) {
  const path = getMyDashboardPath();
  const cur = String(route.path || '').replace(/\/$/, '') || '/';
  const want = String(path || '').replace(/\/$/, '') || '/';
  const query = { ...(route.query || {}), tab: 'log_time' };
  if (cur === want) {
    return router.replace({ path: want, query }).catch(() => {});
  }
  return router.push({ path: want, query }).catch(() => {});
}

export function noteAidPath(route) {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/note-aid` : '/admin/note-aid';
}
