<template>
  <section class="invitee-panel">
    <div class="invitee-header">
      <h4>Invitees & RSVP</h4>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="refresh" :disabled="loading">Refresh</button>
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          @click="sendReminders('attending')"
          :disabled="sendingReminders"
          title="Email all who RSVPd Yes or Maybe"
        >
          {{ sendingReminders ? 'Sending…' : '📧 Remind Attending' }}
        </button>
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          @click="sendReminders('no_response')"
          :disabled="sendingReminders"
          title="Email everyone who has not responded yet"
        >
          {{ sendingReminders ? 'Sending…' : '📧 Nudge Non-responders' }}
        </button>
        <button class="btn btn-primary btn-sm" type="button" @click="sendInvites" :disabled="sendingInvites">
          {{ sendingInvites ? 'Sending…' : 'Send Invitations' }}
        </button>
      </div>
    </div>
    <div v-if="reminderResult" class="reminder-result">{{ reminderResult }}</div>

    <div class="summary-row" v-if="summary.length">
      <span v-for="item in summary" :key="item.key" class="summary-chip">
        {{ item.label }}: {{ item.total }}
      </span>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="response-list">
      <div class="table-title">Responses</div>
      <div v-if="responses.length === 0" class="muted">No responses yet.</div>
      <table v-else class="mini-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Response</th>
            <th>Source</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in responses" :key="`${row.userId}-${row.receivedAt || row.responseKey}`">
            <td>{{ row.name }}</td>
            <td>{{ row.responseLabel || row.responseKey }}</td>
            <td>{{ row.source }}</td>
            <td>{{ formatDateTime(row.receivedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Unmatched guest registrations (no account link) -->
    <div class="response-list" v-if="guestRegistrations.length">
      <div class="table-title">
        Unmatched Guest Registrations
        <span class="unmatched-badge" title="These attendees submitted an RSVP from the public page but couldn't be linked to an account automatically. Match them manually or ask them to re-submit using their work email.">{{ guestRegistrations.length }}</span>
      </div>
      <p class="muted" style="font-size:12px;margin-bottom:8px;">These RSVPs came from the public event page but couldn't be linked to a staff account via email, phone, or name. Ask them to re-submit with their work email or sign in first, and then contact an admin to link the record.</p>
      <table class="mini-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Phone</th><th>Response</th><th>Guests</th><th>Dietary</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in guestRegistrations" :key="g.id">
            <td>{{ g.firstName }} {{ g.lastName }}</td>
            <td>{{ g.email }}</td>
            <td>{{ g.phone || '-' }}</td>
            <td>{{ g.response }}</td>
            <td>{{ g.guestCount }}</td>
            <td>{{ g.dietaryNotes || '-' }}</td>
            <td>{{ g.notes || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!potluckEnabled" class="need-list">
      <div class="table-title">Need List (Potluck)</div>
      <div class="muted">Enable <strong>Potluck style</strong> in the event setup above to add categorized needed items.</div>
    </div>

    <div v-else class="need-list">
      <div class="table-title">Need List (Potluck)</div>
      <div class="need-create">
        <select v-model="newItemCategory" class="input">
          <option value="food">Food</option>
          <option value="drinks">Drinks</option>
          <option value="dessert">Dessert</option>
          <option value="supplies">Supplies</option>
          <option value="other">Other</option>
        </select>
        <input v-model.trim="newItemName" class="input" placeholder="Item needed (e.g. fruit tray)" />
        <input v-model.trim="newItemNotes" class="input" placeholder="Notes (optional)" />
        <button class="btn btn-secondary btn-sm" type="button" @click="addNeedItem" :disabled="addingNeed || !newItemName">
          Add
        </button>
      </div>
      <div v-if="needItems.length === 0" class="muted">No need-list items yet.</div>
      <table v-else class="mini-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Item</th>
            <th>Notes</th>
            <th>Claimed by</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in needItems" :key="item.id">
            <td><span class="cat-chip">{{ formatCategory(item.itemCategory) }}</span></td>
            <td>{{ item.itemName }}</td>
            <td>{{ item.itemNotes || '-' }}</td>
            <td>{{ item.claimedByName || '-' }}</td>
            <td>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="toggleClaim(item)"
                :disabled="claimingId === item.id"
              >
                {{ isItemClaimed(item) ? 'Unclaim' : 'Claim' }}
              </button>
              <button class="btn btn-danger btn-sm" type="button" @click="deleteNeedItem(item)" :disabled="deletingId === item.id">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  potluckEnabled: { type: Boolean, default: false }
});

const loading = ref(false);
const error = ref('');
const sendingInvites = ref(false);
const sendingReminders = ref(false);
const reminderResult = ref('');
const addingNeed = ref(false);
const claimingId = ref(0);
const deletingId = ref(0);

const summary = ref([]);
const responses = ref([]);
const needItems = ref([]);
const guestRegistrations = ref([]);
const newItemCategory = ref('food');
const newItemName = ref('');
const newItemNotes = ref('');

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '-';
  return d.toLocaleString();
};

const loadResponses = async () => {
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/${props.eventId}/responses`);
  summary.value = resp.data?.summary || [];
  responses.value = resp.data?.responses || [];
};

const loadNeedList = async () => {
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/${props.eventId}/need-list`);
  needItems.value = Array.isArray(resp.data) ? resp.data : [];
};

const loadGuestRegistrations = async () => {
  try {
    const resp = await api.get(`/agencies/${props.agencyId}/company-events/${props.eventId}/guest-registrations`);
    guestRegistrations.value = Array.isArray(resp.data) ? resp.data : [];
  } catch {
    guestRegistrations.value = [];
  }
};

const refresh = async () => {
  if (!props.agencyId || !props.eventId) return;
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadResponses(), loadNeedList(), loadGuestRegistrations()]);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load invitee panel';
  } finally {
    loading.value = false;
  }
};

const sendInvites = async () => {
  sendingInvites.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${props.eventId}/send-invitations`, {});
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send invitations';
  } finally {
    sendingInvites.value = false;
  }
};

/**
 * Send email reminders to a subset of invitees:
 *   'attending'    → response is yes or maybe
 *   'no_response'  → has not yet responded at all
 *   'all'          → every invitee
 */
const sendReminders = async (audience) => {
  sendingReminders.value = true;
  reminderResult.value = '';
  error.value = '';
  try {
    const resp = await api.post(
      `/agencies/${props.agencyId}/company-events/${props.eventId}/send-reminders`,
      { audience }
    );
    const sent = Number(resp.data?.sent || 0);
    reminderResult.value = `Reminder sent to ${sent} recipient${sent !== 1 ? 's' : ''}.`;
    setTimeout(() => { reminderResult.value = ''; }, 5000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send reminders';
  } finally {
    sendingReminders.value = false;
  }
};

const addNeedItem = async () => {
  if (!newItemName.value) return;
  addingNeed.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${props.eventId}/need-list`, {
      itemCategory: newItemCategory.value || 'other',
      itemName: newItemName.value,
      itemNotes: newItemNotes.value || null
    });
    newItemCategory.value = 'food';
    newItemName.value = '';
    newItemNotes.value = '';
    await loadNeedList();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add need-list item';
  } finally {
    addingNeed.value = false;
  }
};

const formatCategory = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'Other';
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const toggleClaim = async (item) => {
  claimingId.value = Number(item.id);
  error.value = '';
  try {
    const claimed = isItemClaimed(item);
    await api.patch(`/agencies/${props.agencyId}/company-events/${props.eventId}/need-list/${item.id}`, {
      claim: !claimed,
      unclaim: claimed
    });
    await loadNeedList();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to update claim';
  } finally {
    claimingId.value = 0;
  }
};

const isItemClaimed = (item) =>
  !!(Number(item?.claimedByUserId || 0) > 0 || String(item?.claimedByGuestEmail || '').trim());

const deleteNeedItem = async (item) => {
  deletingId.value = Number(item.id);
  error.value = '';
  try {
    await api.delete(`/agencies/${props.agencyId}/company-events/${props.eventId}/need-list/${item.id}`);
    await loadNeedList();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete item';
  } finally {
    deletingId.value = 0;
  }
};

watch(
  () => [props.agencyId, props.eventId],
  () => { refresh(); },
  { immediate: true }
);

onMounted(refresh);
</script>

<style scoped>
.invitee-panel { border: 1px solid var(--border, #d9d9d9); border-radius: 10px; padding: 14px; margin-top: 14px; background: #fff; }
.invitee-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.invitee-header h4 { margin: 0; }
.actions { display: flex; gap: 8px; }
.summary-row { margin: 10px 0; display: flex; gap: 8px; flex-wrap: wrap; }
.summary-chip { padding: 4px 8px; border-radius: 999px; background: #eef6ff; border: 1px solid #d5e8ff; font-size: 12px; }
.response-list, .need-list { margin-top: 12px; }
.table-title { font-weight: 700; margin-bottom: 8px; }
.mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mini-table th, .mini-table td { border-top: 1px solid #ebebeb; padding: 8px; text-align: left; vertical-align: top; }
.need-create { display: grid; gap: 8px; grid-template-columns: 140px minmax(180px, 1fr) minmax(180px, 1fr) auto; margin-bottom: 10px; }
.error { color: #b91c1c; margin: 8px 0; }
.reminder-result { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 13px; color: #166534; }
.unmatched-badge { display: inline-block; background: #fef9c3; border: 1px solid #fde047; color: #713f12; border-radius: 999px; font-size: 11px; padding: 1px 7px; margin-left: 6px; font-weight: 700; vertical-align: middle; cursor: help; }
.cat-chip { display: inline-block; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
</style>
