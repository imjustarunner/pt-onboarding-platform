const CACHE_TTL_MS = 15000;
const statusCache = new Map();

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function readStoredUserAgencies() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem('userAgencies') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function flattenAgencies(authUser) {
  const fromUser = Array.isArray(authUser?.agencies) ? authUser.agencies : [];
  const fromStorage = readStoredUserAgencies();
  return [...fromUser, ...fromStorage];
}

export function resolveOrganizationIdFromSlug({ organizationSlug, authUser }) {
  const slug = normalizeSlug(organizationSlug);
  if (!slug) return null;
  const agencies = flattenAgencies(authUser);
  const match = agencies.find((org) => {
    const portal = normalizeSlug(org?.portal_url || org?.portalUrl || org?.slug);
    return portal && portal === slug;
  });
  const id = Number(match?.id || 0);
  return id > 0 ? id : null;
}

export async function getSchoolStaffWaiverStatus({ api, authUser, organizationSlug, forceRefresh = false }) {
  const orgId = resolveOrganizationIdFromSlug({ organizationSlug, authUser });
  if (!orgId) return null;
  const userId = Number(authUser?.id || 0);
  const cacheKey = `${userId}:${orgId}`;
  const now = Date.now();
  const cached = statusCache.get(cacheKey);
  if (!forceRefresh && cached && (now - cached.ts) < CACHE_TTL_MS) {
    return cached.data;
  }
  const response = await api.get(`/school-portal/${orgId}/school-staff-waiver/status`, {
    skipGlobalLoading: true
  });
  const data = response?.data || null;
  statusCache.set(cacheKey, { ts: now, data });
  return data;
}

