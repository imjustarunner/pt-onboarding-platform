<template>
  <div
    v-if="visible"
    class="bc-chip-wrap"
    :class="{
      'is-attention': attentionActive,
      'is-expanded': expanded,
      'is-pending': status.hasPendingPrompt
    }"
  >
    <button
      type="button"
      class="bc-chip"
      :title="chipTitle"
      @click="onChipClick"
    >
      <span class="bc-chip-logo">
        <img
          v-if="heroBook?.bookCoverUrl && !coverFailed"
          :src="heroBook.bookCoverUrl"
          alt=""
          class="bc-chip-logo-img"
          @error="coverFailed = true"
        />
        <span v-else class="bc-chip-logo-fallback" aria-hidden="true">BC</span>
      </span>
      <span class="bc-chip-text">
        <span class="bc-chip-name">Book Club</span>
        <span class="bc-chip-type">{{ typeLine }}</span>
      </span>
      <span v-if="status.hasPendingPrompt" class="bc-chip-dot" aria-hidden="true" />
    </button>

    <Transition name="bc-pop">
      <div v-if="expanded" class="bc-pop" role="dialog" aria-label="Book Club">
        <div class="bc-pop-head">
          <strong>{{ heroBook?.className || 'Monthly read' }}</strong>
          <button type="button" class="bc-pop-close" aria-label="Close" @click.stop="collapse">×</button>
        </div>
        <p v-if="heroBook?.bookAuthor" class="bc-pop-meta">{{ heroBook.bookAuthor }}</p>
        <p class="bc-pop-status">{{ statusLine }}</p>
        <div v-if="status.hasPendingPrompt" class="bc-pop-actions">
          <button type="button" class="bc-btn bc-btn--primary" :disabled="saving" @click.stop="respond('enroll')">
            Join
          </button>
          <button type="button" class="bc-btn" :disabled="saving" @click.stop="respond('skip')">
            Skip
          </button>
        </div>
        <router-link class="bc-pop-link" :to="publicPath" @click="collapse">Open Book Club →</router-link>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const emit = defineEmits(['visibility']);

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const status = ref({});
const loading = ref(false);
const saving = ref(false);
const coverFailed = ref(false);
const expanded = ref(false);
const attentionActive = ref(false);

let winkTimer = null;
let collapseTimer = null;
let attentionTimer = null;

const currentAgencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || 0);
const orgSlug = computed(() =>
  String(route.params?.organizationSlug || agencyStore.currentAgency?.portal_url || agencyStore.currentAgency?.slug || '').trim()
);
const heroBook = computed(() => status.value.currentBook || status.value.upcomingBook || null);
const publicPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/bookclub` : '/bookclub'));

const visible = computed(() => {
  if (loading.value && !status.value?.enabled) return false;
  return (
    status.value?.enabled === true &&
    status.value?.eligible === true &&
    status.value?.configured === true &&
    status.value?.portalPublished === true &&
    !!heroBook.value
  );
});

const typeLine = computed(() => {
  if (expanded.value && heroBook.value?.className) return String(heroBook.value.className);
  if (status.value.hasPendingPrompt) return 'New book';
  if (heroBook.value?.bookMonthLabel) return String(heroBook.value.bookMonthLabel);
  return 'Club';
});

const chipTitle = computed(() => {
  const title = heroBook.value?.className || 'Book Club';
  if (status.value.hasPendingPrompt) return `${title} — action needed`;
  return title;
});

const statusLine = computed(() => {
  if (status.value.currentResponseStatus === 'enrolled') return 'You’re enrolled this month.';
  if (status.value.currentResponseStatus === 'skipped') return 'You skipped — you can still join.';
  if (status.value.hasPendingPrompt) return 'A new book is out. Join or skip?';
  if (status.value.upcomingBook && !status.value.currentBook) return 'Preview the next monthly book.';
  return 'See what the club is reading.';
});

const seenKey = computed(() => {
  const uid = authStore.user?.id;
  const aid = currentAgencyId.value;
  const bookId = heroBook.value?.id;
  if (uid == null || !aid || !bookId) return null;
  return `pt.bookClub.portalChip.seen.${uid}.${aid}.${bookId}`;
});

const clearTimers = () => {
  if (winkTimer) {
    clearTimeout(winkTimer);
    winkTimer = null;
  }
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  if (attentionTimer) {
    clearTimeout(attentionTimer);
    attentionTimer = null;
  }
};

const collapse = () => {
  expanded.value = false;
  attentionActive.value = false;
};

const runAttentionBurst = ({ forceExpand = true } = {}) => {
  if (!visible.value) return;
  attentionActive.value = true;
  if (forceExpand) expanded.value = true;

  if (collapseTimer) clearTimeout(collapseTimer);
  // Expand briefly, then wink shut
  collapseTimer = setTimeout(() => {
    expanded.value = false;
    attentionActive.value = false;
  }, 4200);

  // Mark this book as seen after first attention so we don't spam every load
  const key = seenKey.value;
  if (key && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
};

const scheduleOccasionalWink = () => {
  if (winkTimer) clearTimeout(winkTimer);
  // Only keep nudging when they still need to act
  if (!status.value.hasPendingPrompt) return;
  const delay = 55000 + Math.floor(Math.random() * 40000); // ~55–95s
  winkTimer = setTimeout(() => {
    runAttentionBurst({ forceExpand: true });
    scheduleOccasionalWink();
  }, delay);
};

const maybeStartAttention = () => {
  if (!visible.value) return;
  const needsAttention = Boolean(status.value.hasPendingPrompt);
  const key = seenKey.value;
  const seen = key && typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

  if (needsAttention && !seen) {
    // New book / first time seeing this prompt — flash soon after mount
    attentionTimer = setTimeout(() => {
      runAttentionBurst({ forceExpand: true });
      scheduleOccasionalWink();
    }, 900);
    return;
  }

  if (needsAttention) {
    scheduleOccasionalWink();
  }
};

const loadStatus = async () => {
  if (!currentAgencyId.value) {
    status.value = {};
    emit('visibility', false);
    return;
  }
  loading.value = true;
  try {
    const resp = await api.get('/me/book-club/status', {
      params: { agencyId: currentAgencyId.value },
      skipGlobalLoading: true
    });
    status.value = resp.data || {};
    coverFailed.value = false;
  } catch {
    status.value = {};
  } finally {
    loading.value = false;
    emit('visibility', visible.value);
    clearTimers();
    maybeStartAttention();
  }
};

const respond = async (action) => {
  saving.value = true;
  try {
    await api.post('/me/book-club/respond', {
      agencyId: currentAgencyId.value,
      action
    });
    await loadStatus();
    if (!status.value.hasPendingPrompt) collapse();
  } catch {
    /* keep pop open */
  } finally {
    saving.value = false;
  }
};

const onChipClick = () => {
  if (status.value.hasPendingPrompt) {
    expanded.value = !expanded.value;
    attentionActive.value = false;
    return;
  }
  router.push(publicPath.value);
};

onMounted(loadStatus);
onBeforeUnmount(clearTimers);

watch(currentAgencyId, () => {
  clearTimers();
  collapse();
  loadStatus();
});

watch(visible, (v) => emit('visibility', v));
</script>

<style scoped>
.bc-chip-wrap {
  position: relative;
  flex: 0 0 auto;
}

.bc-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 200px;
  padding: 4px 10px 4px 4px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: linear-gradient(135deg, #15213f 0%, #224f7d 55%, #2d8c6e 100%);
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s ease, box-shadow 0.2s ease, max-width 0.35s ease;
  position: relative;
}

.bc-chip:hover {
  box-shadow: 0 4px 14px rgba(21, 33, 63, 0.25);
}

.bc-chip-wrap.is-expanded .bc-chip,
.bc-chip-wrap.is-attention .bc-chip {
  max-width: 260px;
  box-shadow: 0 0 0 2px rgba(255, 248, 195, 0.55), 0 8px 22px rgba(21, 33, 63, 0.28);
}

.bc-chip-wrap.is-attention .bc-chip {
  animation: bc-wink 1.1s ease-in-out 3;
}

.bc-chip-logo {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bc-chip-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bc-chip-logo-fallback {
  font-size: 9px;
  font-weight: 800;
  color: #fff;
}

.bc-chip-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.bc-chip-name {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.bc-chip-type {
  font-size: 9px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.bc-chip-wrap.is-expanded .bc-chip-type {
  max-width: 180px;
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  font-weight: 600;
}

.bc-chip-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 0 2px #15213f;
  animation: bc-pulse 1.4s ease-in-out infinite;
}

.bc-pop {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: min(280px, 80vw);
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  color: #111827;
}

.bc-pop-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.bc-pop-head strong {
  font-size: 14px;
  line-height: 1.25;
}

.bc-pop-close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
  padding: 0 2px;
}

.bc-pop-meta,
.bc-pop-status {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.bc-pop-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.bc-btn {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.bc-btn--primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}

.bc-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.bc-pop-link {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #166534;
  text-decoration: none;
}

.bc-pop-enter-active,
.bc-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.bc-pop-enter-from,
.bc-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes bc-wink {
  0%, 100% { transform: scale(1); }
  30% { transform: scale(1.06); }
  55% { transform: scale(0.98); }
  75% { transform: scale(1.04); }
}

@keyframes bc-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}
</style>
