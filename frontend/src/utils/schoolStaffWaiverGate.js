const CACHE_TTL_MS = 15000;
const ORG_LOOKUP_TIMEOUT_MS = 5000;
const WAIVER_STATUS_TIMEOUT_MS = 8000;
const statusCache = new Map();

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function roleNorm(user) {
  return String(user?.role || '').trim().toLowerCase();
}

function isSchoolStaffUser(user) {
  return roleNorm(user) === 'school_staff';
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
  let orgId = resolveOrganizationIdFromSlug({ organizationSlug, authUser });
  if (!orgId && !isSchoolStaffUser(authUser)) {
    try {
      const slug = normalizeSlug(organizationSlug);
      if (slug) {
        const orgResp = await api.get(`/agencies/slug/${slug}`, {
          skipGlobalLoading: true,
          timeout: ORG_LOOKUP_TIMEOUT_MS
        });
        const fetchedId = Number(orgResp?.data?.id || 0);
        if (fetchedId > 0) orgId = fetchedId;
      }
    } catch {
      // Ignore fallback failures and return no status.
    }
  }
  if (!orgId) return null;
  const userId = Number(authUser?.id || 0);
  const cacheKey = `${userId}:${orgId}`;
  const now = Date.now();
  const cached = statusCache.get(cacheKey);
  if (!forceRefresh && cached && (now - cached.ts) < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const response = await api.get(`/school-portal/${orgId}/school-staff-waiver/status`, {
      skipGlobalLoading: true,
      timeout: WAIVER_STATUS_TIMEOUT_MS
    });
    const data = response?.data || null;
    statusCache.set(cacheKey, { ts: now, data });
    return data;
  } catch {
    // Fail open: never block navigation/doc signing if status lookup is slow/unavailable.
    return null;
  }
}

