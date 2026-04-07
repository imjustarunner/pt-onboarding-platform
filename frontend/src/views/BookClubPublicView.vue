<template>
  <div class="book-club-public">
    <section v-if="loading" class="book-club-public__shell">Loading Book Club...</section>
    <section v-else-if="error" class="book-club-public__shell error">{{ error }}</section>
    <template v-else-if="data">
      <section class="book-club-hero">
        <div class="book-club-hero__copy">
          <p class="book-club-hero__eyebrow">{{ data.tenant?.name }} presents</p>
          <h1>{{ data.bookClub?.name || 'Book Club' }}</h1>
          <p class="book-club-hero__lede">
            Read together, RSVP together, and keep the next conversation on the calendar.
          </p>

          <div class="book-club-hero__actions">
            <button v-if="isAuthenticated" class="btn btn-primary" type="button" :disabled="saving" @click="respond('enroll')">
              Join this month
            </button>
            <router-link v-else class="btn btn-primary" :to="loginPath">Sign in to join</router-link>
            <button v-if="isAuthenticated" class="btn btn-secondary" type="button" :disabled="saving" @click="respond('skip')">
              Skip this month
            </button>
          </div>
          <div v-if="actionMessage" class="book-club-public__message">{{ actionMessage }}</div>
        </div>

        <div class="book-club-hero__feature">
          <img
            v-if="featuredBook?.bookCoverUrl"
            :src="featuredBook.bookCoverUrl"
            :alt="featuredBook.className"
            class="book-club-hero__cover"
          />
          <div v-else class="book-club-hero__cover book-club-hero__cover--fallback">{{ fallbackInitials }}</div>
          <div class="book-club-hero__book-card">
            <span class="book-club-pill">{{ featuredBook?.bookMonthLabel || 'Current selection' }}</span>
            <h2>{{ featuredBook?.className }}</h2>
            <p v-if="featuredBook?.bookAuthor" class="muted">{{ featuredBook.bookAuthor }}</p>
            <p v-if="featuredBook?.description">{{ featuredBook.description }}</p>
          </div>
        </div>
      </section>

      <section class="book-club-grid">
        <article class="book-club-panel">
          <h3>Next meeting</h3>
          <p v-if="data.nextEvent">{{ formatEvent(data.nextEvent) }}</p>
          <p v-else class="muted">Meeting details will appear here as soon as the manager posts them.</p>
        </article>

        <article class="book-club-panel">
          <h3>Club managers</h3>
          <p v-if="data.managers?.length" class="book-club-manager-list">
            {{ data.managers.map((m) => m.name).join(' · ') }}
          </p>
          <p v-else class="muted">Management assignments will show here after setup.</p>
        </article>
      </section>

      <section v-if="archive.length" class="book-club-archive">
        <div class="book-club-section-head">
          <h2>Past books</h2>
          <p>Retroactive additions and past reads all stay visible here.</p>
        </div>
        <div class="book-club-archive__grid">
          <article v-for="book in archive" :key="book.id" class="book-club-archive__item">
            <img v-if="book.bookCoverUrl" :src="book.bookCoverUrl" :alt="book.className" />
            <div>
              <strong>{{ book.className }}</strong>
              <div class="muted">{{ book.bookAuthor || 'Author TBD' }}</div>
              <p>{{ book.description || 'No summary added yet.' }}</p>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const actionMessage = ref('');
const data = ref(null);

const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());
const isAuthenticated = computed(() => authStore.isAuthenticated);
const featuredBook = computed(() => data.value?.currentBook || data.value?.upcomingBook || null);
const archive = computed(() => Array.isArray(data.value?.archive) ? data.value.archive : []);
const fallbackInitials = computed(() => String(featuredBook.value?.className || 'BC').slice(0, 2).toUpperCase());
const loginPath = computed(() => `/${orgSlug.value}/login?returnTo=${encodeURIComponent(route.fullPath)}`);

const formatEvent = (event) => {
  const start = event?.startsAt ? new Date(event.startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return event?.title || 'Upcoming meeting';
  const when = start.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const location = [event?.eventLocationName, event?.eventLocationAddress].filter(Boolean).join(' · ');
  return [event?.title || 'Upcoming meeting', when, location].filter(Boolean).join(' · ');
};

const load = async () => {
  if (!orgSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/agencies/portal/${encodeURIComponent(orgSlug.value)}/bookclub/public`);
    data.value = resp.data || null;
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Unable to load Book Club';
  } finally {
    loading.value = false;
  }
};

const respond = async (action) => {
  if (!data.value?.tenant?.id) return;
  saving.value = true;
  actionMessage.value = '';
  try {
    await api.post('/me/book-club/respond', {
      agencyId: Number(data.value.tenant.id),
      action
    });
    actionMessage.value = action === 'enroll'
      ? 'You’re in. Your dashboard will now show this month’s book club status.'
      : 'You’ve skipped this month. You can still change that later.';
  } catch (err) {
    actionMessage.value = err?.response?.data?.error?.message || err?.message || 'Could not update your Book Club response.';
  } finally {
    saving.value = false;
  }
};

onMounted(load);

watch(orgSlug, async (nextSlug, prevSlug) => {
  if (nextSlug && nextSlug !== prevSlug) await load();
});
</script>

<style scoped>
.book-club-public {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(255, 230, 149, 0.4), transparent 22%),
    linear-gradient(160deg, #f5f9ff 0%, #fffaf0 48%, #eef7f3 100%);
}
.book-club-public__shell {
  max-width: 1100px;
  margin: 0 auto;
}
.book-club-hero {
  max-width: 1100px;
  margin: 0 auto 28px;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 24px;
  padding: 28px;
  border-radius: 32px;
  background: linear-gradient(135deg, #10203d 0%, #1c4673 48%, #2ea58d 100%);
  color: #fff;
  box-shadow: 0 30px 70px rgba(16, 32, 61, 0.18);
}
.book-club-hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 0.78rem;
  opacity: 0.76;
}
.book-club-hero h1 {
  margin: 0 0 10px;
  font-size: clamp(2.1rem, 5vw, 4rem);
}
.book-club-hero__lede {
  max-width: 52ch;
  color: rgba(255, 255, 255, 0.88);
}
.book-club-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}
.book-club-hero__feature {
  display: grid;
  gap: 16px;
}
.book-club-hero__cover {
  width: 100%;
  min-height: 360px;
  object-fit: cover;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.08);
}
.book-club-hero__cover--fallback {
  display: grid;
  place-items: center;
  font-size: 62px;
  font-weight: 800;
}
.book-club-hero__book-card {
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.09);
}
.book-club-pill {
  display: inline-flex;
  margin-bottom: 10px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 248, 195, 0.18);
  color: #fff7c7;
  font-size: 0.85rem;
}
.book-club-grid,
.book-club-archive {
  max-width: 1100px;
  margin: 0 auto;
}
.book-club-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 28px;
}
.book-club-panel {
  padding: 22px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 42px rgba(25, 45, 84, 0.08);
}
.book-club-section-head p,
.book-club-manager-list,
.book-club-panel p,
.book-club-archive__item p {
  margin: 0;
}
.book-club-archive__grid {
  display: grid;
  gap: 16px;
}
.book-club-archive__item {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
}
.book-club-archive__item img {
  width: 90px;
  height: 120px;
  object-fit: cover;
  border-radius: 14px;
}
.book-club-public__message {
  margin-top: 12px;
  color: #fff7c7;
}
@media (max-width: 900px) {
  .book-club-public {
    padding: 16px;
  }
  .book-club-hero,
  .book-club-grid {
    grid-template-columns: 1fr;
  }
  .book-club-archive__item {
    grid-template-columns: 1fr;
  }
}
</style>
