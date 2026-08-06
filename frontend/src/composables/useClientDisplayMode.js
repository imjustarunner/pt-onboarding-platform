import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';

const displayModeRef = ref('initials');
let activeStorageKey = null;
let persistenceWatchInstalled = false;

function storageKeyForUser(userId) {
  return `cmv_display_mode_v1_${userId || 'anon'}`;
}

function readStoredMode(userId, forceInitials) {
  if (forceInitials) return 'initials';
  try {
    return localStorage.getItem(storageKeyForUser(userId)) || 'initials';
  } catch {
    return 'initials';
  }
}

function syncDisplayModeFromUser(authStore) {
  const userId = authStore.user?.id;
  const key = storageKeyForUser(userId);
  const forceInitials = String(authStore.user?.role || '').toLowerCase() === 'school_staff';
  activeStorageKey = key;
  displayModeRef.value = readStoredMode(userId, forceInitials);
}

/**
 * Shared client label privacy mode for admin client views (initials / name / code).
 * Persists per user in localStorage — same key as Client Management "All Clients".
 */
export function useClientDisplayMode() {
  const authStore = useAuthStore();

  const isSchoolStaffRole = computed(
    () => String(authStore.user?.role || '').toLowerCase() === 'school_staff'
  );

  if (activeStorageKey !== storageKeyForUser(authStore.user?.id)) {
    syncDisplayModeFromUser(authStore);
  }

  if (!persistenceWatchInstalled) {
    persistenceWatchInstalled = true;
    watch(displayModeRef, (mode) => {
      const store = useAuthStore();
      if (String(store.user?.role || '').toLowerCase() === 'school_staff') return;
      try {
        localStorage.setItem(storageKeyForUser(store.user?.id), mode);
      } catch {
        /* ignore */
      }
    });
    watch(
      () => useAuthStore().user?.id,
      () => syncDisplayModeFromUser(useAuthStore())
    );
    watch(isSchoolStaffRole, (forced) => {
      if (forced) displayModeRef.value = 'initials';
    });
  }

  const canToggleDisplayMode = computed(() => !isSchoolStaffRole.value);

  function normalizeClientFields(client) {
    if (!client) return { initials: '', code: '', fullName: '', id: null };
    return {
      initials: String(client.initials || client.clientInitials || '').trim(),
      code: String(
        client.identifier_code || client.identifierCode || client.clientIdentifierCode || ''
      ).trim(),
      fullName: String(client.full_name || client.fullName || '').trim(),
      id: client.id != null ? client.id : client.clientId,
    };
  }

  function getClientLabel(client, { fallbackPrefix = 'Client' } = {}) {
    const { initials, code, fullName, id } = normalizeClientFields(client);
    const fallback = id != null ? `${fallbackPrefix} #${id}` : '—';

    if (isSchoolStaffRole.value) return initials || code || fallback;

    const mode = displayModeRef.value;
    if (mode === 'full_name') {
      if (fullName) return initials ? `${fullName} (${initials})` : fullName;
      return initials || code || fallback;
    }
    if (mode === 'code') return code || initials || fallback;
    return initials || code || fallback;
  }

  function getAvatarLetters(client) {
    const { initials, fullName } = normalizeClientFields(client);
    if (initials) return initials.slice(0, 2).toUpperCase();
    const fromName = fullName || getClientLabel(client);
    const letters = fromName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() || '')
      .slice(0, 2)
      .join('');
    return letters || '?';
  }

  return {
    displayMode: displayModeRef,
    canToggleDisplayMode,
    isSchoolStaffRole,
    getClientLabel,
    getAvatarLetters,
  };
}
