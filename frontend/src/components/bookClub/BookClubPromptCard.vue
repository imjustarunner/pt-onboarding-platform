<template>
  <section v-if="shellVisible" class="book-club-card">
    <div class="book-club-card__chrome">
      <button
        type="button"
        class="book-club-card__toggle"
        :aria-expanded="expanded"
        aria-controls="book-club-card-panel"
        @click="expanded = !expanded"
      >
        <span class="book-club-card__chevron" aria-hidden="true">{{ expanded ? '▼' : '▶' }}</span>
        <span class="book-club-card__toggle-label">
          <span class="book-club-card__toggle-title">Book Club</span>
          <span v-if="!expanded && heroBook" class="book-club-card__toggle-book">{{ heroBook.className }}</span>
        </span>
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm book-club-card__dismiss"
        title="Hide Book Club on My Dashboard until your next sign-in"
        @click="dismissForSession"
      >
        Not now
      </button>
    </div>

    <div id="book-club-card-panel" v-show="expanded" class="book-club-card__inner">
    <div class="book-club-card__media">
      <img
        v-if="heroBook?.bookCoverUrl"
        :src="heroBook.bookCoverUrl"
        :alt="heroBook.className"
        class="book-club-card__cover"
      />
      <div v-else class="book-club-card__cover book-club-card__cover--fallback">
        <span>{{ initials }}</span>
      </div>
    </div>

    <div class="book-club-card__body">
      <div class="book-club-card__eyebrow">Book Club</div>
      <h2>{{ heroBook?.className || 'Monthly read' }}</h2>
      <p class="book-club-card__meta">
        <span v-if="heroBook?.bookAuthor">{{ heroBook.bookAuthor }}</span>
        <span v-if="heroBook?.bookMonthLabel"> · {{ heroBook.bookMonthLabel }}</span>
      </p>
      <p v-if="heroBook?.description" class="book-club-card__description">{{ heroBook.description }}</p>

      <div v-if="status.nextEvent" class="book-club-card__event">
        <strong>Next meeting</strong>
        <span>{{ formatEvent(status.nextEvent) }}</span>
      </div>

      <div v-if="status.hasPendingPrompt" class="book-club-card__actions">
        <button class="btn btn-primary" type="button" :disabled="saving" @click="respond('enroll')">Join this month</button>
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="respond('skip')">Skip this month</button>
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="respond('never')">Never show Book Club</button>
      </div>

      <div v-else-if="status.interestStatus === 'never'" class="book-club-card__actions">
        <span class="book-club-card__state">Book Club prompts are hidden for you.</span>
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="respond('reenable')">Re-enable</button>
      </div>

      <div v-else class="book-club-card__actions">
        <span class="book-club-card__state">{{ statusLine }}</span>
        <button
          v-if="status.currentResponseStatus === 'skipped'"
          class="btn btn-primary"
          type="button"
          :disabled="saving"
          @click="respond('enroll')"
        >
          Enroll anyway
        </button>
      </div>

      <router-link class="book-club-card__link" :to="publicPath">Open Book Club page</router-link>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const status = ref({});
const expanded = ref(false);
const dismissed = ref(false);

const currentAgencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || 0);
const orgSlug = computed(() => String(route.params?.organizationSlug || agencyStore.currentAgency?.portal_url || agencyStore.currentAgency?.slug || '').trim());
const heroBook = computed(() => status.value.currentBook || status.value.upcomingBook || null);
const initials = computed(() => String(heroBook.value?.className || 'BC').trim().slice(0, 2).toUpperCase());
const publicPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/bookclub` : '/bookclub'));
const shouldRender = computed(() => {
  if (loading.value) return false;
  return (
    status.value?.enabled === true &&
    status.value?.eligible === true &&
    status.value?.configured === true &&
    status.value?.portalPublished === true &&
    !!heroBook.value
  );
});

const dismissStorageKey = computed(() => {
  const uid = authStore.user?.id;
  const aid = currentAgencyId.value;
  if (uid == null || !Number(aid)) return null;
  return `pt.bookClubDash.dismissedSession.${uid}.${aid}`;
});

const readDismissedForSession = () => {
  const key = dismissStorageKey.value;
  if (!key) {
    dismissed.value = false;
    return;
  }
  const sid = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') || '' : '';
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  dismissed.value = stored !== null && stored === sid && sid !== '';
};

const dismissForSession = () => {
  const key = dismissStorageKey.value;
  const sid = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') || '' : '';
  if (key && sid) {
    try {
      localStorage.setItem(key, sid);
    } catch {
      /* ignore quota */
    }
  }
  dismissed.value = true;
};

const shellVisible = computed(() => shouldRender.value && !dismissed.value);
const statusLine = computed(() => {
  if (status.value.currentResponseStatus === 'enrolled') return 'You are enrolled in this month’s book.';
  if (status.value.currentResponseStatus === 'skipped') return 'You skipped this month, but you can still join.';
  if (status.value.upcomingBook && !status.value.currentBook) return 'A new monthly book is ready to preview.';
  return 'See what the club is reading next.';
});

const formatEvent = (event) => {
  const startsAt = event?.startsAt ? new Date(event.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return event?.title || 'Upcoming event';
  return `${event.title || 'Upcoming event'} · ${startsAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
};

const loadStatus = async () => {
  if (!currentAgencyId.value) return;
  readDismissedForSession();
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get('/me/book-club/status', { params: { agencyId: currentAgencyId.value } });
    status.value = resp.data || {};
    expanded.value = Boolean(status.value?.hasPendingPrompt);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to load Book Club';
  } finally {
    loading.value = false;
  }
};

const respond = async (action) => {
  saving.value = true;
  error.value = '';
  try {
    await api.post('/me/book-club/respond', {
      agencyId: currentAgencyId.value,
      action
    });
    await loadStatus();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to update Book Club';
  } finally {
    saving.value = false;
  }
};

onMounted(loadStatus);

watch(currentAgencyId, async (nextId, prevId) => {
  if (Number(nextId || 0) !== Number(prevId || 0)) {
    readDismissedForSession();
    await loadStatus();
  }
});

watch(dismissStorageKey, () => {
  readDismissedForSession();
});
</script>

<style scoped>
.book-club-card {
  display: grid;
  gap: 0;
  border-radius: 26px;
  background:
    radial-gradient(circle at top left, rgba(255, 244, 199, 0.9), transparent 34%),
    linear-gradient(135deg, #15213f 0%, #224f7d 48%, #2d8c6e 100%);
  color: #fff;
  box-shadow: 0 26px 60px rgba(18, 33, 63, 0.18);
  overflow: hidden;
}
.book-club-card__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.book-club-card__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.book-club-card__toggle:hover {
  background: rgba(255, 255, 255, 0.08);
}
.book-club-card__chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  opacity: 0.85;
  width: 1.25rem;
}
.book-club-card__toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.book-club-card__toggle-title {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  opacity: 0.88;
}
.book-club-card__toggle-book {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-club-card__dismiss {
  flex-shrink: 0;
  border-color: rgba(255, 255, 255, 0.35);
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
.book-club-card__dismiss:hover {
  background: rgba(255, 255, 255, 0.18);
}
.book-club-card__inner {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 20px;
  padding: 20px;
}
.book-club-card__media {
  display: flex;
  align-items: stretch;
}
.book-club-card__cover {
  width: 100%;
  min-height: 250px;
  object-fit: cover;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}
.book-club-card__cover--fallback {
  display: grid;
  place-items: center;
  font-size: 48px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.book-club-card__body {
  display: grid;
  gap: 12px;
  align-content: center;
}
.book-club-card__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 0.78rem;
  opacity: 0.78;
}
.book-club-card__body h2 {
  margin: 0;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
}
.book-club-card__meta,
.book-club-card__description,
.book-club-card__state {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
}
.book-club-card__event {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.09);
}
.book-club-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.book-club-card__link {
  color: #fff8c3;
  font-weight: 700;
  text-decoration: none;
}
@media (max-width: 900px) {
  .book-club-card__inner {
    grid-template-columns: 1fr;
  }
  .book-club-card__media {
    max-width: 220px;
  }
}
</style>
