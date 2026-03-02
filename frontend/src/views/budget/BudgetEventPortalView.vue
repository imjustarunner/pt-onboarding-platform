<template>
  <div class="budget-event-portal container">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="event" class="card" style="margin-top: 24px;">
      <h1>{{ event.name }}</h1>
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
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const route = useRoute();
const agencyStore = useAgencyStore();
const organizationSlug = computed(() => route.params.organizationSlug);
const eventSlug = computed(() => route.params.eventSlug);
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const event = ref(null);
const loading = ref(false);
const error = ref('');
const expenses = ref([]);
const expensesLoading = ref(false);

async function loadEvent() {
  if (!agencyId.value || !eventSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/events/by-slug/${eventSlug.value}`);
    event.value = data;
    if (data?.portalEnabled) loadExpenses();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Event not found';
    event.value = null;
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
