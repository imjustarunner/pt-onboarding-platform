<template>
  <div class="budget-event-portal container">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <p v-if="wrongDoorHint" class="muted" style="margin-top: 10px;">{{ wrongDoorHint }}</p>
      <router-link
        v-if="programsEventsHref"
        class="btn btn-secondary btn-sm"
        style="margin-top: 12px; display: inline-block;"
        :to="programsEventsHref"
      >
        Go to Programs &amp; events
      </router-link>
    </div>
    <div v-else-if="event" class="card" style="margin-top: 24px;">
      <h1>{{ event.name }}</h1>
      <p class="muted" style="margin-top: 4px;">Budget event portal — expenses for this budget event.</p>
      <p v-if="event.description" class="muted">{{ event.description }}</p>
      <div v-if="event.portalEnabled" class="portal-section">
        <h2 style="margin: 16px 0 8px 0;">Expenses</h2>
        <p class="muted" style="margin-bottom: 12px;">Expenses linked to this event's business purposes.</p>
        <div v-if="expensesLoading" class="muted">Loading expenses…</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Department</th>
                <th>Category</th>
                <th>Place</th>
                <th>Vendor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in expenses" :key="e.id">
                <td>{{ e.expense_date }}</td>
                <td class="right">${{ Number(e.amount).toFixed(2) }}</td>
                <td>{{ e.department_name }}</td>
                <td>{{ e.category_name }}</td>
                <td>{{ e.place }}</td>
                <td>{{ e.vendor || '—' }}</td>
              </tr>
              <tr v-if="!expenses.length"><td colspan="6" class="muted">No expenses for this event.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const organizationSlug = computed(() => route.params.organizationSlug);
const eventSlug = computed(() => route.params.eventSlug);
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const event = ref(null);
const loading = ref(false);
const error = ref('');
const wrongDoorHint = ref('');
const expenses = ref([]);
const expensesLoading = ref(false);

const programsEventsHref = computed(() => {
  const slug = String(organizationSlug.value || '').trim();
  return slug ? `/${slug}/admin/program-events` : '/admin/program-events';
});

async function loadEvent() {
  if (!agencyId.value || !eventSlug.value) return;

  // Wrong door: numeric path segment is almost always a company event id
  // (`/skill-builders/event/:id`), not a budget event slug.
  const rawSlug = String(eventSlug.value || '').trim();
  const maybeCompanyEventId = Number(rawSlug);
  if (Number.isFinite(maybeCompanyEventId) && maybeCompanyEventId > 0 && String(maybeCompanyEventId) === rawSlug) {
    const slug = String(organizationSlug.value || '').trim();
    if (slug) {
      await router.replace(`/${slug}/skill-builders/event/${maybeCompanyEventId}`);
      return;
    }
  }

  loading.value = true;
  error.value = '';
  wrongDoorHint.value = '';
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/events/by-slug/${eventSlug.value}`);
    event.value = data;
    if (data?.portalEnabled) loadExpenses();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Event not found';
    error.value = msg;
    event.value = null;
    if (/budget management is not enabled/i.test(String(msg))) {
      wrongDoorHint.value =
        'Looking for a company / outreach event (staff, photos, attendance)? Use Programs & events → Open portal — this page is only for Budget expense events.';
    } else {
      wrongDoorHint.value =
        'This URL is the Budget event portal (expenses). Company events open from Programs & events.';
    }
  } finally {
    loading.value = false;
  }
}

async function loadExpenses() {
  if (!event.value?.id || !agencyId.value) return;
  expensesLoading.value = true;
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/events/${event.value.id}/expenses`);
    expenses.value = data || [];
  } catch {
    expenses.value = [];
  } finally {
    expensesLoading.value = false;
  }
}

watch([agencyId, eventSlug], loadEvent, { immediate: true });
</script>
