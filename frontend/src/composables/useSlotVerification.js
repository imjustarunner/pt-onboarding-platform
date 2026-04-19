/**
 * Slot verification composable.
 *
 * Centralizes the API surface for the school portal "Push slot verification" feature:
 * - admin/staff/super_admin/support: list per-school request status, push to a provider, cancel
 * - provider: read own pending request status, respond
 *
 * Maintains a single in-memory cache per (organizationId) so the directory list,
 * day panels, and the profile page can all reflect the same status without
 * duplicating fetches.
 */
import { computed, reactive } from 'vue';
import api from '../services/api';

const ORG_STATE = reactive({}); // { [organizationId]: { byProvider: { [providerUserId]: request|null }, loadedAt: number, loading: boolean, error: string } }
const PROVIDER_PENDING = reactive({}); // { [organizationId]: { pending: request|null, loadedAt: number, loading: boolean, error: string } }

function ensureOrgState(orgId) {
  const key = String(orgId || '');
  if (!ORG_STATE[key]) {
    ORG_STATE[key] = { byProvider: {}, loadedAt: 0, loading: false, error: '' };
  }
  return ORG_STATE[key];
}

function ensureProviderPending(orgId) {
  const key = String(orgId || '');
  if (!PROVIDER_PENDING[key]) {
    PROVIDER_PENDING[key] = { pending: null, loadedAt: 0, loading: false, error: '' };
  }
  return PROVIDER_PENDING[key];
}

const PUSH_ROLES = new Set(['admin', 'super_admin', 'staff', 'support']);

export function canPushSlotVerification(role) {
  return PUSH_ROLES.has(String(role || '').trim().toLowerCase());
}

/** Format the directory/profile status pill text. */
export function statusPillText(req) {
  if (!req) return '';
  const status = String(req.status || '').toUpperCase();
  if (status === 'PENDING') return 'Verification pending';
  if (status === 'CONFIRMED') return 'Slots confirmed';
  if (status === 'CHANGES_REQUESTED') return 'Slot changes requested';
  if (status === 'CANCELLED') return 'Verification cancelled';
  return '';
}

export function statusPillVariant(req) {
  if (!req) return '';
  const status = String(req.status || '').toUpperCase();
  if (status === 'PENDING') return 'warning';
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CHANGES_REQUESTED') return 'warning';
  if (status === 'CANCELLED') return 'muted';
  return '';
}

export function useSlotVerification(organizationIdRef) {
  const orgIdValue = () => Number(
    typeof organizationIdRef === 'function'
      ? organizationIdRef()
      : (organizationIdRef?.value ?? organizationIdRef)
  ) || null;

  const orgState = computed(() => {
    const id = orgIdValue();
    return id ? ensureOrgState(id) : { byProvider: {}, loadedAt: 0, loading: false, error: '' };
  });

  const providerState = computed(() => {
    const id = orgIdValue();
    return id ? ensureProviderPending(id) : { pending: null, loadedAt: 0, loading: false, error: '' };
  });

  /**
   * Admin: load latest request per provider for this school. Caches in-memory.
   * Pass { force: true } to bypass the 60s cache window.
   */
  const fetchOrgRequests = async ({ force = false } = {}) => {
    const id = orgIdValue();
    if (!id) return;
    const state = ensureOrgState(id);
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 60_000) return;
    state.loading = true;
    state.error = '';
    try {
      const r = await api.get(`/school-portal/${id}/slot-verification-requests`, { skipGlobalLoading: true });
      const map = (r.data && typeof r.data.by_provider === 'object') ? r.data.by_provider : {};
      const next = {};
      for (const [k, v] of Object.entries(map || {})) next[String(k)] = v;
      state.byProvider = next;
      state.loadedAt = Date.now();
    } catch (e) {
      state.error = e?.response?.data?.error?.message || 'Failed to load slot verification status';
    } finally {
      state.loading = false;
    }
  };

  /** Provider: load own pending verification (if any). */
  const fetchMyPending = async ({ force = false } = {}) => {
    const id = orgIdValue();
    if (!id) return null;
    const state = ensureProviderPending(id);
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 30_000) return state.pending;
    state.loading = true;
    state.error = '';
    try {
      const r = await api.get(`/school-portal/${id}/my-slot-verification`, { skipGlobalLoading: true });
      state.pending = r.data?.pending || null;
      state.loadedAt = Date.now();
      return state.pending;
    } catch (e) {
      state.error = e?.response?.data?.error?.message || '';
      state.pending = null;
      return null;
    } finally {
      state.loading = false;
    }
  };

  /** Admin: push a verification request to one provider. */
  const pushVerification = async (providerUserId, { message = '' } = {}) => {
    const id = orgIdValue();
    if (!id || !providerUserId) throw new Error('Missing organization or provider id');
    const r = await api.post(`/school-portal/${id}/providers/${providerUserId}/slot-verification`, {
      message: message || undefined
    });
    await fetchOrgRequests({ force: true });
    return r.data;
  };

  /** Admin: cancel a pending request by id. */
  const cancelRequest = async (requestId) => {
    const id = orgIdValue();
    if (!id || !requestId) throw new Error('Missing organization or request id');
    await api.post(`/school-portal/${id}/slot-verification-requests/${requestId}/cancel`);
    await fetchOrgRequests({ force: true });
  };

  /** Provider: explicitly close (Confirm path is handled server-side via /provider-availability/confirm). */
  const respondPending = async ({ kind = 'changes_requested', summary = '', schoolRequestId = null } = {}) => {
    const id = orgIdValue();
    if (!id) return null;
    const body = { kind };
    if (summary) body.summary = summary;
    if (schoolRequestId) body.schoolRequestId = Number(schoolRequestId);
    const r = await api.post(`/school-portal/${id}/my-slot-verification/respond`, body);
    const state = ensureProviderPending(id);
    state.pending = null;
    state.loadedAt = Date.now();
    return r.data;
  };

  /**
   * After the provider successfully calls the existing `provider-availability/confirm`
   * endpoint we want the local cache cleared so any banner/badge updates immediately.
   */
  const clearMyPending = () => {
    const id = orgIdValue();
    if (!id) return;
    const state = ensureProviderPending(id);
    state.pending = null;
    state.loadedAt = Date.now();
  };

  const requestForProvider = (providerUserId) => {
    const state = orgState.value;
    return state.byProvider?.[String(providerUserId)] || null;
  };

  return {
    orgState,
    providerState,
    fetchOrgRequests,
    fetchMyPending,
    pushVerification,
    cancelRequest,
    respondPending,
    clearMyPending,
    requestForProvider
  };
}
