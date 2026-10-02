export function sanitizeDashboardRailOrder(value) {
  return [...new Set(value
    .filter((id) => typeof id === 'string' && /^[a-z][a-z0-9_-]{0,99}$/i.test(id))
  )].slice(0, 200);
}
