import { computed, ref, unref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import api from '../services/api';

const SPLASH_DISMISS_PREFIX = 'sscDashboardSplashDismissed.v1';

/**
 * Club / affiliation scheduled announcements: scrolling banner + splash modal (same APIs as org dashboard).
 * @param {import('vue').Ref|import('vue').ComputedRef<number|null>} announcementClubIdRef
 * @param {import('vue').Ref|import('vue').ComputedRef<string>} splashBrandLabelRef
 */
export function useAffiliationClubAnnouncements(announcementClubIdRef, splashBrandLabelRef) {
  const authStore = useAuthStore();
  const clubDashboardBanner = ref(null);
  const clubScheduledBannerItems = ref([]);
  const splashDismissVersion = ref(0);

  const clubDashboardBannerTexts = computed(() => {
    const scheduled = Array.isArray(clubScheduledBannerItems.value) ? clubScheduledBannerItems.value : [];
    const scheduledTexts = scheduled
      .filter((a) => String(a?.display_type || 'announcement').trim().toLowerCase() !== 'splash')
      .map((a) => {
        const title = String(a?.title || '').trim();
        const msg = String(a?.message || '').trim();
        const base = title && title.toLowerCase() !== 'announcement' ? `${title}: ${msg}` : msg;
        return String(base || '').trim();
      })
      .filter(Boolean);
    const birthdayText = String(clubDashboardBanner.value?.message || '').trim();
    return [...scheduledTexts, birthdayText].filter(Boolean).slice(0, 10);
  });

  const splashAnnouncements = computed(() => {
    const scheduled = Array.isArray(clubScheduledBannerItems.value) ? clubScheduledBannerItems.value : [];
    return scheduled
      .filter((a) => String(a?.display_type || 'announcement').trim().toLowerCase() === 'splash')
      .sort((a, b) => new Date(a?.starts_at || 0) - new Date(b?.starts_at || 0));
  });

  const splashDismissKey = (item) => {
    const userId = Number(authStore.user?.id || 0);
    const orgId = Number(unref(announcementClubIdRef) || 0);
    const splashId = Number(item?.id || 0);
    if (!userId || !orgId || !splashId) return null;
    return `${SPLASH_DISMISS_PREFIX}:${userId}:${orgId}:${splashId}`;
  };

  const isSplashDismissed = (item) => {
    const key = splashDismissKey(item);
    if (!key) return false;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const untilTs = Number.parseInt(String(raw), 10);
      if (!Number.isFinite(untilTs) || untilTs <= Date.now()) {
        localStorage.removeItem(key);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const openClubSplashes = computed(() => {
    void splashDismissVersion.value;
    return splashAnnouncements.value.filter((item) => !isSplashDismissed(item));
  });

  const currentClubSplash = computed(() => openClubSplashes.value[0] || null);

  const clubSplashTitle = computed(() => {
    const title = String(currentClubSplash.value?.title || '').trim();
    if (title && title.toLowerCase() !== 'announcement') return title;
    return 'Important announcement';
  });

  const clubSplashBrandLabel = computed(() => {
    const b = unref(splashBrandLabelRef);
    const name = String(b || '').trim();
    return name || SUMMIT_STATS_TEAM_CHALLENGE_NAME;
  });

  const formatClubSplashEndsAt = (dateLike) => {
    const dt = new Date(dateLike || 0);
    if (!Number.isFinite(dt.getTime())) return '';
    return dt.toLocaleString();
  };

  const dismissClubSplash = () => {
    const item = currentClubSplash.value;
    if (!item) return;
    const key = splashDismissKey(item);
    if (!key) return;
    const endTs = new Date(item?.ends_at || 0).getTime();
    const fallbackTs = Date.now() + 24 * 60 * 60 * 1000;
    const persistUntil = Number.isFinite(endTs) ? endTs : fallbackTs;
    try {
      localStorage.setItem(key, String(persistUntil));
    } catch {
      /* ignore */
    }
    splashDismissVersion.value += 1;
  };

  const remindLaterClubSplash = () => {
    const item = currentClubSplash.value;
    if (!item) return;
    const key = splashDismissKey(item);
    if (!key) return;
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(key, String(until));
    } catch {
      /* ignore */
    }
    splashDismissVersion.value += 1;
  };

  const loadClubAnnouncements = async () => {
    const cid = unref(announcementClubIdRef);
    if (!cid) {
      clubDashboardBanner.value = null;
      clubScheduledBannerItems.value = [];
      return;
    }
    try {
      const [birthdayResp, scheduledResp] = await Promise.allSettled([
        api.get(`/agencies/${cid}/dashboard-banner`, { skipGlobalLoading: true }),
        api.get(`/agencies/${cid}/announcements/banner`, { skipGlobalLoading: true })
      ]);
      if (birthdayResp.status === 'fulfilled') {
        clubDashboardBanner.value = birthdayResp.value?.data?.banner || null;
      } else {
        clubDashboardBanner.value = null;
      }
      if (scheduledResp.status === 'fulfilled') {
        clubScheduledBannerItems.value = Array.isArray(scheduledResp.value?.data) ? scheduledResp.value.data : [];
      } else {
        clubScheduledBannerItems.value = [];
      }
    } catch {
      clubDashboardBanner.value = null;
      clubScheduledBannerItems.value = [];
    }
  };

  watch(announcementClubIdRef, () => {
    loadClubAnnouncements();
  }, { immediate: true });

  return {
    clubDashboardBanner,
    clubScheduledBannerItems,
    clubDashboardBannerTexts,
    currentClubSplash,
    clubSplashTitle,
    clubSplashBrandLabel,
    formatClubSplashEndsAt,
    loadClubAnnouncements,
    dismissClubSplash,
    remindLaterClubSplash
  };
}
