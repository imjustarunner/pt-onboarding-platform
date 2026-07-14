<template>
  <div class="practitioner-team-panel">
    <div class="section-header">
      <h2>Team</h2>
      <p class="section-description">
        Invite assistants to help with clients, calendar, and packets. Owners keep settings, public booking, and package catalog.
      </p>
    </div>

    <p v-if="error" class="banner error">{{ error }}</p>
    <p v-if="notice" class="banner ok">{{ notice }}</p>

    <section class="card">
      <div class="card-head">
        <h3>Members</h3>
        <button type="button" class="btn ghost" :disabled="loading" @click="load">Refresh</button>
      </div>
      <p v-if="loading" class="muted">Loading…</p>
      <ul v-else class="member-list">
        <li v-for="m in members" :key="m.id" class="member-row">
          <div class="member-main">
            <div class="name">{{ m.firstName }} {{ m.lastName }}</div>
            <div class="meta">{{ m.email }} · {{ m.isOwner ? 'Owner' : 'Assistant' }} · {{ m.status }}</div>
            <div v-if="!m.isOwner" class="caps">
              <label v-for="cap in capabilityKeys" :key="cap" class="cap">
                <input
                  type="checkbox"
                  :checked="!!m.permissions?.[cap]"
                  :disabled="savingId === m.id"
                  @change="toggleCap(m, cap, $event.target.checked)"
                />
                {{ cap }}
              </label>
            </div>
          </div>
          <div class="member-actions">
            <button
              v-if="!m.isOwner && !m.hasPassword"
              type="button"
              class="btn ghost"
              :disabled="savingId === m.id"
              @click="resendSetup(m)"
            >
              Resend setup
            </button>
            <button
              v-if="!m.isOwner"
              type="button"
              class="btn danger"
              :disabled="savingId === m.id"
              @click="remove(m)"
            >
              Remove
            </button>
          </div>
        </li>
        <li v-if="!members.length" class="muted">No team members yet.</li>
      </ul>
    </section>

    <section class="card invite">
      <h3>Invite assistant</h3>
      <form class="invite-form" @submit.prevent="invite">
        <label>
          First name
          <input v-model="form.firstName" type="text" required autocomplete="given-name" />
        </label>
        <label>
          Last name
          <input v-model="form.lastName" type="text" required autocomplete="family-name" />
        </label>
        <label class="span-2">
          Work email
          <input v-model="form.email" type="email" required autocomplete="email" />
        </label>
        <fieldset class="span-2">
          <legend>Capabilities</legend>
          <label v-for="cap in capabilityKeys" :key="'invite-' + cap" class="cap">
            <input v-model="form.permissions[cap]" type="checkbox" />
            {{ cap }}
          </label>
        </fieldset>
        <div class="span-2 actions">
          <button type="submit" class="btn primary" :disabled="inviting">
            {{ inviting ? 'Inviting…' : 'Send invite' }}
          </button>
        </div>
      </form>
      <p v-if="lastSetupLink" class="setup-link">
        Setup link (share if email is not wired):
        <a :href="lastSetupLink" target="_blank" rel="noopener">{{ lastSetupLink }}</a>
      </p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const capabilityKeys = ['clients', 'inquiries', 'calendar', 'discovery', 'packets', 'messages'];

const loading = ref(false);
const inviting = ref(false);
const savingId = ref(null);
const error = ref('');
const notice = ref('');
const members = ref([]);
const lastSetupLink = ref('');

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  permissions: {
    clients: true,
    inquiries: true,
    calendar: true,
    discovery: true,
    packets: true,
    messages: true
  }
});

function resolveAgencyId() {
  if (props.agencyId) return Number(props.agencyId);
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  return Number(current?.id || 0) || 0;
}

async function load() {
  const agencyId = resolveAgencyId();
  if (!agencyId) {
    error.value = 'Select a practitioner tenant first.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/practitioner-team', { params: { agencyId } });
    members.value = res.data?.members || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load team';
    members.value = [];
  } finally {
    loading.value = false;
  }
}

async function invite() {
  const agencyId = resolveAgencyId();
  if (!agencyId) return;
  inviting.value = true;
  error.value = '';
  notice.value = '';
  lastSetupLink.value = '';
  try {
    const res = await api.post('/practitioner-team/invite', {
      agencyId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      permissions: { ...form.permissions }
    });
    notice.value = res.data?.message || 'Assistant invited';
    lastSetupLink.value = res.data?.setupLink || '';
    form.firstName = '';
    form.lastName = '';
    form.email = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Invite failed';
  } finally {
    inviting.value = false;
  }
}

async function toggleCap(member, cap, checked) {
  const agencyId = resolveAgencyId();
  savingId.value = member.id;
  error.value = '';
  notice.value = '';
  const next = { ...(member.permissions || {}), [cap]: !!checked };
  try {
    await api.put(`/practitioner-team/${member.id}/permissions`, {
      agencyId,
      permissions: next
    });
    member.permissions = next;
    notice.value = 'Permissions updated';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Update failed';
    await load();
  } finally {
    savingId.value = null;
  }
}

async function resendSetup(member) {
  const agencyId = resolveAgencyId();
  savingId.value = member.id;
  error.value = '';
  notice.value = '';
  try {
    const res = await api.post(`/practitioner-team/${member.id}/resend-setup`, { agencyId });
    lastSetupLink.value = res.data?.setupLink || '';
    notice.value = 'Setup link refreshed';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not resend setup';
  } finally {
    savingId.value = null;
  }
}

async function remove(member) {
  if (!window.confirm(`Remove ${member.firstName} ${member.lastName} from this team?`)) return;
  const agencyId = resolveAgencyId();
  savingId.value = member.id;
  error.value = '';
  notice.value = '';
  try {
    await api.delete(`/practitioner-team/${member.id}`, { params: { agencyId } });
    notice.value = 'Member removed';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Remove failed';
  } finally {
    savingId.value = null;
  }
}

onMounted(load);
watch(() => props.agencyId, load);
</script>

<style scoped>
.practitioner-team-panel { width: 100%; }
.section-header { margin-bottom: 1.25rem; }
.section-header h2 { margin: 0 0 0.35rem; }
.section-description { margin: 0; color: var(--text-secondary, #64748b); }
.banner {
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  margin-bottom: 0.85rem;
  font-size: 0.9rem;
}
.banner.error { background: rgba(185, 28, 28, 0.08); color: #991b1b; }
.banner.ok { background: rgba(22, 163, 74, 0.1); color: #166534; }
.card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  margin-bottom: 1rem;
  background: #fff;
}
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
.card h3 { margin: 0 0 0.75rem; font-size: 1rem; }
.member-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.85rem; }
.member-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}
.member-row:last-child { border-bottom: 0; padding-bottom: 0; }
.name { font-weight: 700; }
.meta { font-size: 0.82rem; color: #64748b; margin-top: 0.15rem; }
.caps { display: flex; flex-wrap: wrap; gap: 0.55rem 0.85rem; margin-top: 0.55rem; }
.cap { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; text-transform: capitalize; }
.member-actions { display: flex; gap: 0.4rem; align-items: flex-start; }
.invite-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
}
.invite-form label { display: grid; gap: 0.3rem; font-size: 0.85rem; font-weight: 600; }
.invite-form input[type='text'],
.invite-form input[type='email'] {
  font-weight: 400;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
}
.span-2 { grid-column: 1 / -1; }
fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 1rem;
}
legend { padding: 0 0.25rem; font-size: 0.82rem; font-weight: 700; }
.actions { display: flex; }
.btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn.primary { background: #1b4332; color: #fff; border-color: #1b4332; }
.btn.danger { color: #991b1b; border-color: rgba(153, 27, 27, 0.35); }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.muted { color: #64748b; font-size: 0.9rem; }
.setup-link {
  margin-top: 0.85rem;
  font-size: 0.8rem;
  word-break: break-all;
  color: #334155;
}
@media (max-width: 720px) {
  .invite-form { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
}
</style>
