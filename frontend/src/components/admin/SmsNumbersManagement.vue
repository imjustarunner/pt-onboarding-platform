<template>
  <div class="sms-numbers">
    <div class="section-header">
      <h2>Texting Numbers</h2>
      <p class="muted">Manage Twilio numbers, assignments, and SMS compliance rules.</p>
    </div>

    <div v-if="!agencyStore.currentAgency" class="empty-state">
      Select an agency to manage texting numbers.
    </div>

    <div v-else class="content">
      <div class="card">
        <h3>Agency SMS Settings</h3>
        <div v-if="settingsError" class="error">{{ settingsError }}</div>
        <div class="grid">
          <div class="form-group">
            <label>Enable SMS numbers</label>
            <select v-model="settings.smsNumbersEnabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Compliance mode</label>
            <select v-model="settings.smsComplianceMode" class="select">
              <option value="opt_in_required">Opt-in required</option>
              <option value="outreach_allowed">Outreach allowed</option>
            </select>
          </div>
          <div class="form-group">
            <label>Default inbound user</label>
            <select v-model="settings.smsDefaultUserId" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button class="btn" :disabled="savingSettings" @click="saveSettings">
            {{ savingSettings ? 'Saving…' : 'Save settings' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Numbers</h3>
        <div class="toolbar">
          <div class="inline">
            <input v-model="newNumber" class="input" placeholder="+15551234567" />
            <input v-model="newFriendlyName" class="input" placeholder="Friendly name (optional)" />
            <button class="btn" :disabled="addingNumber || !newNumber" @click="addNumber">
              {{ addingNumber ? 'Adding…' : 'Add number' }}
            </button>
          </div>
        </div>

        <div class="toolbar">
          <div class="inline">
            <input v-model="searchAreaCode" class="input" placeholder="Area code" />
            <button class="btn btn-secondary" :disabled="searchingNumbers" @click="searchNumbers">
              {{ searchingNumbers ? 'Searching…' : 'Search Twilio' }}
            </button>
          </div>
        </div>

        <div v-if="searchResults.length" class="search-results">
          <div class="muted">Available numbers</div>
          <div class="list">
            <div v-for="n in searchResults" :key="n.phoneNumber" class="row">
              <div class="left">{{ n.phoneNumber }}</div>
              <button class="btn btn-secondary" @click="buyNumber(n.phoneNumber)">
                Buy
              </button>
            </div>
          </div>
        </div>

        <div v-if="numbers.length === 0" class="empty-state">No numbers yet.</div>
        <div v-else class="list">
          <div v-for="n in numbers" :key="n.id" class="row">
            <div class="left">
              <div class="title">{{ n.phone_number }}</div>
              <div class="muted">
                Status: {{ n.status }} · {{ n.is_active ? 'Active' : 'Inactive' }}
              </div>
              <div class="muted" v-if="n.assignments?.length">
                Assigned to: {{ assignmentLabel(n.assignments[0]) }}
              </div>
              <div class="muted" v-else>Assigned to: Agency pool</div>
            </div>
            <div class="right">
              <select v-model="assignmentDraft[n.id]" class="select">
                <option :value="''">Assign to…</option>
                <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
                  {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
                </option>
              </select>
              <button class="btn btn-secondary" @click="assignNumber(n)">
                Assign
              </button>
              <button v-if="n.assignments?.length" class="btn btn-secondary" @click="unassignNumber(n)">
                Unassign
              </button>
              <button class="btn btn-secondary" @click="selectRules(n)">
                Rules
              </button>
              <button class="btn btn-danger" @click="releaseNumber(n)">Release</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedNumber" class="card">
        <h3>Rules: {{ selectedNumber.phone_number }}</h3>
        <div class="grid">
          <div class="form-group">
            <label>After-hours auto-reply</label>
            <textarea v-model="ruleDraft.after_hours.auto_reply_text" class="textarea" rows="3" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.after_hours.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Opt-in confirmation</label>
            <textarea v-model="ruleDraft.opt_in.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.opt_in.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Opt-out confirmation</label>
            <textarea v-model="ruleDraft.opt_out.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.opt_out.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Help message</label>
            <textarea v-model="ruleDraft.help.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.help.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Emergency forward user</label>
            <select v-model="ruleDraft.emergency_forward.forward_to_user_id" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Emergency forward phone</label>
            <input v-model="ruleDraft.emergency_forward.forward_to_phone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>Enable emergency forward</label>
            <select v-model="ruleDraft.emergency_forward.enabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Forward inbound to user</label>
            <select v-model="ruleDraft.forward_inbound.forward_to_user_id" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Forward inbound to phone</label>
            <input v-model="ruleDraft.forward_inbound.forward_to_phone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>Forward message template</label>
            <textarea v-model="ruleDraft.forward_inbound.auto_reply_text" class="textarea" rows="3" placeholder="Inbound text from {{from}}: {{body}}" />
          </div>
          <div class="form-group">
            <label>Enable inbound forwarding</label>
            <select v-model="ruleDraft.forward_inbound.enabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button class="btn" :disabled="savingRules" @click="saveRules">
            {{ savingRules ? 'Saving…' : 'Save rules' }}
          </button>
          <button class="btn btn-secondary" @click="clearSelectedRules">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const settings = ref({
  smsNumbersEnabled: false,
  smsComplianceMode: 'opt_in_required',
  smsDefaultUserId: null
});
const settingsError = ref('');
const savingSettings = ref(false);

const numbers = ref([]);
const agencyUsers = ref([]);
const newNumber = ref('');
const newFriendlyName = ref('');
const addingNumber = ref(false);

const searchAreaCode = ref('');
const searchResults = ref([]);
const searchingNumbers = ref(false);

const assignmentDraft = ref({});

const selectedNumber = ref(null);
const ruleDraft = ref({
  after_hours: { rule_type: 'after_hours', auto_reply_text: '', enabled: true },
  opt_in: { rule_type: 'opt_in', auto_reply_text: '', enabled: true },
  opt_out: { rule_type: 'opt_out', auto_reply_text: '', enabled: true },
  help: { rule_type: 'help', auto_reply_text: '', enabled: true },
  emergency_forward: { rule_type: 'emergency_forward', forward_to_user_id: null, forward_to_phone: '', enabled: false },
  forward_inbound: { rule_type: 'forward_inbound', auto_reply_text: '', forward_to_user_id: null, forward_to_phone: '', enabled: false }
});
const savingRules = ref(false);

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loadSettings = async () => {
  if (!agencyId.value) return;
  settingsError.value = '';
  try {
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}/settings`);
    settings.value = {
      smsNumbersEnabled: res.data?.smsNumbersEnabled === true,
      smsComplianceMode: res.data?.smsComplianceMode || 'opt_in_required',
      smsDefaultUserId: res.data?.smsDefaultUserId || null
    };
  } catch (e) {
    settingsError.value = e?.response?.data?.error?.message || 'Failed to load SMS settings';
  }
};

const saveSettings = async () => {
  if (!agencyId.value) return;
  savingSettings.value = true;
  settingsError.value = '';
  try {
    await api.put(`/sms-numbers/agency/${agencyId.value}/settings`, settings.value);
  } catch (e) {
    settingsError.value = e?.response?.data?.error?.message || 'Failed to save SMS settings';
  } finally {
    savingSettings.value = false;
  }
};

const loadNumbers = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}`);
    numbers.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    numbers.value = [];
  }
};

const loadUsers = async () => {
  try {
    const res = await api.get('/users', { params: { includeArchived: false } });
    const rows = Array.isArray(res.data) ? res.data : [];
    const aId = Number(agencyId.value);
    agencyUsers.value = rows.filter((u) => {
      const ids = String(u.agency_ids || '').split(',').map((v) => parseInt(v, 10));
      return ids.includes(aId);
    });
  } catch {
    agencyUsers.value = [];
  }
};

const addNumber = async () => {
  if (!agencyId.value || !newNumber.value) return;
  addingNumber.value = true;
  try {
    await api.post(`/sms-numbers/agency/${agencyId.value}/add`, {
      phoneNumber: newNumber.value,
      friendlyName: newFriendlyName.value
    });
    newNumber.value = '';
    newFriendlyName.value = '';
    await loadNumbers();
  } finally {
    addingNumber.value = false;
  }
};

const searchNumbers = async () => {
  if (!agencyId.value) return;
  searchingNumbers.value = true;
  try {
    const res = await api.post(`/sms-numbers/agency/${agencyId.value}/search`, {
      areaCode: searchAreaCode.value || null
    });
    searchResults.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    searchResults.value = [];
  } finally {
    searchingNumbers.value = false;
  }
};

const buyNumber = async (phoneNumber) => {
  if (!agencyId.value || !phoneNumber) return;
  try {
    await api.post(`/sms-numbers/agency/${agencyId.value}/buy`, { phoneNumber });
    await loadNumbers();
  } catch {
    // ignore
  }
};

const assignNumber = async (number) => {
  const userId = assignmentDraft.value[number.id];
  if (!userId) return;
  await api.post('/sms-numbers/assign', {
    numberId: number.id,
    userId: parseInt(userId, 10),
    isPrimary: true
  });
  assignmentDraft.value[number.id] = '';
  await loadNumbers();
};

const unassignNumber = async (number) => {
  const assigned = number.assignments?.[0];
  if (!assigned?.user_id) return;
  await api.post('/sms-numbers/unassign', {
    numberId: number.id,
    userId: assigned.user_id
  });
  await loadNumbers();
};

const releaseNumber = async (number) => {
  if (!number?.id) return;
  await api.delete(`/sms-numbers/${number.id}`);
  await loadNumbers();
};

const selectRules = async (number) => {
  selectedNumber.value = number;
  await loadRules(number.id);
};

const clearSelectedRules = () => {
  selectedNumber.value = null;
};

const loadRules = async (numberId) => {
  if (!numberId) return;
  const res = await api.get(`/sms-numbers/${numberId}/rules`);
  const rules = Array.isArray(res.data) ? res.data : [];
  const pick = (type) => rules.find((r) => r.rule_type === type) || null;
  const setRule = (key, base) => {
    const found = pick(key);
    ruleDraft.value[key] = {
      ...base,
      ...found,
      enabled: found ? found.enabled !== 0 : base.enabled
    };
  };
  setRule('after_hours', ruleDraft.value.after_hours);
  setRule('opt_in', ruleDraft.value.opt_in);
  setRule('opt_out', ruleDraft.value.opt_out);
  setRule('help', ruleDraft.value.help);
  setRule('emergency_forward', ruleDraft.value.emergency_forward);
  setRule('forward_inbound', ruleDraft.value.forward_inbound);
};

const saveRules = async () => {
  if (!selectedNumber.value?.id) return;
  savingRules.value = true;
  try {
    const rules = Object.values(ruleDraft.value).map((r) => ({
      rule_type: r.rule_type,
      auto_reply_text: r.auto_reply_text || null,
      forward_to_user_id: r.forward_to_user_id || null,
      forward_to_phone: r.forward_to_phone || null,
      enabled: r.enabled !== false
    }));
    await api.put(`/sms-numbers/${selectedNumber.value.id}/rules`, { rules });
  } finally {
    savingRules.value = false;
  }
};

const assignmentLabel = (assignment) => {
  const user = agencyUsers.value.find((u) => Number(u.id) === Number(assignment.user_id));
  if (!user) return `User #${assignment.user_id}`;
  return `${user.first_name || ''} ${user.last_name || ''}`.trim();
};

const init = async () => {
  await Promise.all([loadSettings(), loadNumbers(), loadUsers()]);
};

watch(agencyId, async (val) => {
  if (val) await init();
});

onMounted(async () => {
  if (agencyId.value) await init();
});
</script>

<style scoped>
.sms-numbers {
  padding: 12px;
}
.section-header {
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.toolbar {
  margin-bottom: 10px;
}
.inline {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}
.title {
  font-weight: 600;
}
.right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.actions {
  margin-top: 12px;
}
.error {
  color: #b91c1c;
  margin-bottom: 8px;
}
.empty-state {
  color: var(--text-secondary);
  padding: 12px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
}
.textarea {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}
</style>
