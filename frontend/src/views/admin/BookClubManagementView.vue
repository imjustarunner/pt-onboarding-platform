<template>
  <div class="container book-club-admin">
    <div class="book-club-admin__head">
      <div>
        <h1>Book Club Management</h1>
        <p class="muted">
          Run one tenant-wide Book Club using the existing club stack: monthly books, Book Worms voting, meetings, and public preview.
        </p>
      </div>
      <div class="book-club-admin__head-actions">
        <router-link class="btn btn-secondary" :to="publicPath">Open public page</router-link>
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="load">Reload</button>
      </div>
    </div>

    <div v-if="loading" class="muted">Loading Book Club...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!featureEnabled" class="card">
      <h2 style="margin-top: 0;">Feature not enabled</h2>
      <p class="muted">Turn on <strong>Book Club</strong> in the tenant feature flags first, then come back here to set up the manager and monthly books.</p>
    </div>
    <div v-else>
      <div class="book-club-admin__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="book-club-admin__tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <section v-if="activeTab === 'overview'" class="book-club-admin__section">
        <div class="book-club-admin__grid">
          <article class="book-club-admin__panel">
            <h2>{{ bookClub ? 'Settings' : 'Set up Book Club' }}</h2>
            <div class="form-group">
              <label class="lbl">Manager</label>
              <select v-model="settingsForm.managerUserId" class="input">
                <option value="">Select a manager...</option>
                <option v-for="user in eligibleUsers" :key="`mgr-${user.id}`" :value="String(user.id)">
                  {{ user.name }} · {{ roleLabel(user.role) }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="lbl">Assistant managers</label>
              <div class="checkbox-grid">
                <label v-for="user in eligibleUsers" :key="`am-${user.id}`" class="checkbox-row">
                  <input
                    type="checkbox"
                    :checked="settingsForm.assistantManagerUserIds.includes(String(user.id))"
                    :disabled="String(user.id) === settingsForm.managerUserId"
                    @change="toggleAssistant(user.id, $event.target.checked)"
                  />
                  <span>{{ user.name }}</span>
                </label>
              </div>
            </div>
            <div v-if="bookClub" class="form-group">
              <label class="lbl">Book Club name</label>
              <input v-model.trim="settingsForm.name" class="input" type="text" />
            </div>
            <div v-if="bookClub" class="form-group">
              <label class="lbl">Logo URL</label>
              <input v-model.trim="settingsForm.logoUrl" class="input" type="url" placeholder="https://..." />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" :disabled="saving" @click="saveSettings">
                {{ saving ? 'Saving...' : (bookClub ? 'Save settings' : 'Create Book Club') }}
              </button>
            </div>
          </article>

          <article class="book-club-admin__panel">
            <h2>Live snapshot</h2>
            <p class="muted">This is the reader-facing summary of the current setup.</p>
            <div class="summary-card">
              <div><strong>Public page</strong><span>{{ publicPath }}</span></div>
              <div><strong>Current book</strong><span>{{ currentBook?.className || 'None yet' }}</span></div>
              <div><strong>Upcoming book</strong><span>{{ upcomingBook?.className || 'None scheduled' }}</span></div>
              <div><strong>Next event</strong><span>{{ nextEvent?.title || 'No meeting posted' }}</span></div>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'books'" class="book-club-admin__section">
        <div class="book-club-admin__grid">
          <article class="book-club-admin__panel">
            <h2>{{ bookForm.id ? 'Edit monthly book' : 'Add monthly book' }}</h2>
            <div class="form-group">
              <label class="lbl">Title</label>
              <input v-model.trim="bookForm.className" class="input" type="text" />
            </div>
            <div class="grid two">
              <div class="form-group">
                <label class="lbl">Author</label>
                <input v-model.trim="bookForm.bookAuthor" class="input" type="text" />
              </div>
              <div class="form-group">
                <label class="lbl">Month label</label>
                <input v-model.trim="bookForm.bookMonthLabel" class="input" type="text" placeholder="April 2026" />
              </div>
            </div>
            <div class="form-group">
              <label class="lbl">Cover URL</label>
              <input v-model.trim="bookForm.bookCoverUrl" class="input" type="url" placeholder="https://..." />
            </div>
            <div class="grid two">
              <div class="form-group">
                <label class="lbl">Starts</label>
                <input v-model="bookForm.startsAt" class="input" type="datetime-local" />
              </div>
              <div class="form-group">
                <label class="lbl">Ends</label>
                <input v-model="bookForm.endsAt" class="input" type="datetime-local" />
              </div>
            </div>
            <div class="grid two">
              <div class="form-group">
                <label class="lbl">Enrollment opens</label>
                <input v-model="bookForm.enrollmentOpensAt" class="input" type="datetime-local" />
              </div>
              <div class="form-group">
                <label class="lbl">Enrollment closes</label>
                <input v-model="bookForm.enrollmentClosesAt" class="input" type="datetime-local" />
              </div>
            </div>
            <div class="form-group">
              <label class="lbl">Summary</label>
              <textarea v-model.trim="bookForm.description" class="input" rows="4" />
            </div>
            <div class="form-group">
              <label class="lbl">Status</label>
              <select v-model="bookForm.status" class="input">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" :disabled="saving || !bookClub" @click="saveBook">
                {{ saving ? 'Saving...' : (bookForm.id ? 'Update book' : 'Create book') }}
              </button>
              <button v-if="bookForm.id" class="btn btn-secondary" type="button" :disabled="saving" @click="resetBookForm">Cancel edit</button>
            </div>
          </article>

          <article class="book-club-admin__panel">
            <h2>Books</h2>
            <div v-if="!books.length" class="muted">No books yet.</div>
            <div v-for="book in books" :key="book.id" class="book-row">
              <div>
                <strong>{{ book.className }}</strong>
                <div class="muted">{{ book.bookAuthor || 'Author TBD' }} · {{ book.bookMonthLabel || 'No month label' }}</div>
                <div class="muted">{{ book.enrollmentCount }} enrolled · {{ book.skippedCount }} skipped</div>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" @click="editBook(book)">Edit</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'members'" class="book-club-admin__section">
        <article class="book-club-admin__panel">
          <h2>Interest tracking</h2>
          <p class="muted">Everyone in the tenant is eligible. This view makes “not interested” and “skip this month” visible, not just enrolled members.</p>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Book club role</th>
                  <th>Interest</th>
                  <th>{{ currentBook?.className || 'Current book' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in interestRows" :key="`interest-${row.userId}`">
                  <td>{{ row.name }}</td>
                  <td>{{ roleLabel(row.role) }}</td>
                  <td>{{ clubRoleLabel(row.clubRole) }}</td>
                  <td>{{ interestLabel(row.interestStatus) }}</td>
                  <td>{{ bookResponseLabel(row.currentBookResponseStatus) }}</td>
                </tr>
                <tr v-if="!interestRows.length">
                  <td colspan="5" class="muted">No eligible users found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'events'" class="book-club-admin__section">
        <CompanyEventsManager
          v-if="bookClub"
          :agency-id="Number(bookClub.id)"
          title="Book Club Meetings"
          subtitle="Use the shared RSVP/event system for in-person meetups, virtual discussions, and reminder pushes."
        />
        <div v-else class="card muted">Set up the Book Club first, then create meetings and RSVPs here.</div>
      </section>

      <section v-else-if="activeTab === 'bookworms'" class="book-club-admin__section">
        <SurveyBuilderView
          v-if="bookClub"
          :agency-id-override="Number(bookClub.id)"
          page-title="Book Worms"
          page-subtitle="Create the next-book vote or other reading prompts using the existing survey builder."
          :push-type-options-override="bookWormPushOptions"
        />
        <div v-else class="card muted">Set up the Book Club first, then use Book Worms to poll interested readers.</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import CompanyEventsManager from '../../components/admin/CompanyEventsManager.vue';
import SurveyBuilderView from './SurveyBuilderView.vue';

const route = useRoute();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const activeTab = ref('overview');
const tenant = ref(null);
const bookClub = ref(null);
const eligibleUsers = ref([]);
const books = ref([]);
const currentBook = ref(null);
const upcomingBook = ref(null);
const nextEvent = ref(null);
const interestRows = ref([]);

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'books', label: 'Books' },
  { id: 'members', label: 'Members' },
  { id: 'events', label: 'Events' },
  { id: 'bookworms', label: 'Book Worms' }
];

const settingsForm = ref({
  managerUserId: '',
  assistantManagerUserIds: [],
  name: '',
  logoUrl: ''
});

const bookForm = ref({
  id: null,
  className: '',
  description: '',
  bookAuthor: '',
  bookCoverUrl: '',
  bookMonthLabel: '',
  startsAt: '',
  endsAt: '',
  enrollmentOpensAt: '',
  enrollmentClosesAt: '',
  status: 'draft'
});

const bookWormPushOptions = [
  { value: 'book_club_members', label: 'All interested book club members' }
];

const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());
const publicPath = computed(() => orgSlug.value ? `/${orgSlug.value}/book-club` : '/book-club');
const featureEnabled = computed(() => tenant.value?.featureFlags?.bookClubEnabled === true || tenant.value?.feature_flags?.bookClubEnabled === true || tenant.value?.bookClubEnabled === true);

const roleLabel = (role) => String(role || '').replace(/_/g, ' ');
const clubRoleLabel = (role) => {
  const key = String(role || 'member').trim().toLowerCase();
  if (key === 'assistant_manager') return 'Assistant manager';
  if (key === 'manager') return 'Manager';
  return 'Member';
};
const interestLabel = (status) => {
  const key = String(status || 'interested').trim().toLowerCase();
  if (key === 'never') return 'Never show';
  return 'Interested';
};
const bookResponseLabel = (status) => {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'enrolled') return 'Enrolled';
  if (key === 'skipped') return 'Skipped this month';
  return 'No response yet';
};

const formatLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const resetBookForm = () => {
  bookForm.value = {
    id: null,
    className: '',
    description: '',
    bookAuthor: '',
    bookCoverUrl: '',
    bookMonthLabel: '',
    startsAt: '',
    endsAt: '',
    enrollmentOpensAt: '',
    enrollmentClosesAt: '',
    status: 'draft'
  };
};

const populateSettingsForm = (payload) => {
  const managers = Array.isArray(payload?.managers) ? payload.managers : [];
  const manager = managers.find((entry) => entry.clubRole === 'manager');
  settingsForm.value = {
    managerUserId: manager?.userId ? String(manager.userId) : '',
    assistantManagerUserIds: managers.filter((entry) => entry.clubRole === 'assistant_manager').map((entry) => String(entry.userId)),
    name: String(payload?.bookClub?.name || ''),
    logoUrl: String(payload?.bookClub?.logo_url || payload?.bookClub?.logoUrl || '')
  };
};

const editBook = (book) => {
  bookForm.value = {
    id: Number(book.id),
    className: String(book.className || ''),
    description: String(book.description || ''),
    bookAuthor: String(book.bookAuthor || ''),
    bookCoverUrl: String(book.bookCoverUrl || ''),
    bookMonthLabel: String(book.bookMonthLabel || ''),
    startsAt: formatLocalInput(book.startsAt),
    endsAt: formatLocalInput(book.endsAt),
    enrollmentOpensAt: formatLocalInput(book.enrollmentOpensAt),
    enrollmentClosesAt: formatLocalInput(book.enrollmentClosesAt),
    status: String(book.status || 'draft')
  };
  activeTab.value = 'books';
};

const toggleAssistant = (userId, checked) => {
  const next = new Set(settingsForm.value.assistantManagerUserIds);
  const key = String(userId);
  if (checked) next.add(key);
  else next.delete(key);
  settingsForm.value.assistantManagerUserIds = [...next];
};

const loadTenant = async () => {
  const resp = await api.get(`/agencies/slug/${encodeURIComponent(orgSlug.value)}`);
  const raw = resp.data || {};
  let flags = raw.feature_flags || {};
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags || '{}'); } catch { flags = {}; }
  }
  tenant.value = { ...raw, featureFlags: flags };
};

const loadInterestRows = async () => {
  if (!tenant.value?.id || !bookClub.value?.id) {
    interestRows.value = [];
    return;
  }
  const resp = await api.get(`/agencies/${tenant.value.id}/book-club/interests`);
  interestRows.value = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
};

const load = async () => {
  if (!orgSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    await loadTenant();
    if (!featureEnabled.value) {
      bookClub.value = null;
      eligibleUsers.value = [];
      books.value = [];
      return;
    }
    const resp = await api.get(`/agencies/${tenant.value.id}/book-club`);
    const payload = resp.data || {};
    bookClub.value = payload.bookClub || null;
    eligibleUsers.value = Array.isArray(payload.eligibleUsers) ? payload.eligibleUsers : [];
    books.value = Array.isArray(payload.books) ? payload.books : [];
    currentBook.value = payload.currentBook || null;
    upcomingBook.value = payload.upcomingBook || null;
    nextEvent.value = payload.nextEvent || null;
    populateSettingsForm(payload);
    await loadInterestRows();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to load Book Club management';
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  if (!tenant.value?.id) return;
  if (!settingsForm.value.managerUserId) {
    error.value = 'Select a manager first.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      managerUserId: Number(settingsForm.value.managerUserId),
      assistantManagerUserIds: settingsForm.value.assistantManagerUserIds.map((value) => Number(value)),
      name: settingsForm.value.name,
      logoUrl: settingsForm.value.logoUrl
    };
    if (bookClub.value) {
      await api.put(`/agencies/${tenant.value.id}/book-club`, payload);
    } else {
      await api.post(`/agencies/${tenant.value.id}/book-club/setup`, payload);
    }
    await load();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to save Book Club settings';
  } finally {
    saving.value = false;
  }
};

const saveBook = async () => {
  if (!tenant.value?.id || !bookClub.value?.id) return;
  if (!bookForm.value.className) {
    error.value = 'Book title is required.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      className: bookForm.value.className,
      description: bookForm.value.description,
      bookAuthor: bookForm.value.bookAuthor,
      bookCoverUrl: bookForm.value.bookCoverUrl,
      bookMonthLabel: bookForm.value.bookMonthLabel,
      startsAt: bookForm.value.startsAt || null,
      endsAt: bookForm.value.endsAt || null,
      enrollmentOpensAt: bookForm.value.enrollmentOpensAt || null,
      enrollmentClosesAt: bookForm.value.enrollmentClosesAt || null,
      status: bookForm.value.status
    };
    if (bookForm.value.id) {
      await api.put(`/agencies/${tenant.value.id}/book-club/books/${bookForm.value.id}`, payload);
    } else {
      await api.post(`/agencies/${tenant.value.id}/book-club/books`, payload);
    }
    resetBookForm();
    await load();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to save monthly book';
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
.book-club-admin {
  display: grid;
  gap: 18px;
}
.book-club-admin__head,
.book-club-admin__head-actions,
.book-club-admin__tabs,
.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.book-club-admin__head {
  justify-content: space-between;
  align-items: flex-start;
}
.book-club-admin__tabs {
  padding: 6px;
  border-radius: 999px;
  background: #eef3ff;
}
.book-club-admin__tab {
  border: 0;
  background: transparent;
  padding: 10px 16px;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
}
.book-club-admin__tab.active {
  background: #16335f;
  color: #fff;
}
.book-club-admin__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.book-club-admin__panel {
  padding: 20px;
  border-radius: 22px;
  background: #fff;
  border: 1px solid #e5e9f2;
  box-shadow: 0 14px 30px rgba(23, 45, 84, 0.05);
}
.checkbox-grid {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #e5e9f2;
  border-radius: 14px;
}
.checkbox-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.summary-card {
  display: grid;
  gap: 12px;
}
.summary-card div {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #f6f8fc;
}
.book-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eef2f7;
}
.book-row:last-child {
  border-bottom: 0;
}
@media (max-width: 960px) {
  .book-club-admin__grid {
    grid-template-columns: 1fr;
  }
}
</style>
