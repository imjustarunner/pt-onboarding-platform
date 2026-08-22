<template>
  <div class="scai">
    <div v-if="loading" class="scai-muted">Loading providers…</div>
    <div v-else-if="loadError" class="scai-error">{{ loadError }}</div>
    <template v-else>
      <div class="scai-provider-row">
        <label class="scai-label" :for="providerSelectId">Primary clinician</label>
        <select
          :id="providerSelectId"
          v-model="selectedProviderUserId"
          class="scai-select"
          :disabled="!!savingKey"
          @change="onProviderChange"
        >
          <option value="">Select provider…</option>
          <option
            v-for="prov in providerOptions"
            :key="prov.provider_user_id"
            :value="String(prov.provider_user_id)"
          >
            {{ providerDisplayName(prov) }}
          </option>
        </select>
      </div>

      <div v-if="selectedProvider" class="scai-days">
        <span class="scai-label">Assigned day</span>
        <div v-if="!visibleWorkDays.length" class="scai-muted">
          No open slots for this provider at this school.
        </div>
        <div v-else class="scai-day-grid" role="group" aria-label="Available service days">
          <button
            v-for="day in visibleWorkDays"
            :key="`${selectedProvider.provider_user_id}-${day.day_of_week}`"
            type="button"
            class="scai-day-chip"
            :class="{
              active: isAssigned(day.day_of_week),
              busy: savingKey === saveKey(selectedProvider.provider_user_id, day.day_of_week)
            }"
            :disabled="!!savingKey"
            :title="dayTitle(day)"
            @click="toggleDay(selectedProvider, day)"
          >
            <span class="scai-day-short">{{ shortDay(day.day_of_week) }}</span>
            <span class="scai-day-meta">{{ dayHours(day) }}</span>
          </button>
        </div>
      </div>

      <div v-if="actionError" class="scai-error">{{ actionError }}</div>
      <div v-if="yearUpdateNotice" class="scai-notice">{{ yearUpdateNotice }}</div>

      <div v-if="slotPrompt" class="scai-slot-prompt">
        <div class="scai-slot-title">
          Place on {{ slotPrompt.providerName }}’s schedule for {{ slotPrompt.serviceDay }}?
        </div>
        <div v-if="!slotPrompt.openSlots.length" class="scai-muted">
          No open soft-schedule slots on {{ slotPrompt.serviceDay }}. You can place them later from Days.
        </div>
        <div v-else class="scai-slot-list">
          <button
            v-for="(slot, idx) in slotPrompt.openSlots"
            :key="slot.id || `open-${idx}`"
            type="button"
            class="scai-slot-option"
            :class="{ selected: selectedSlotIndex === slotIndexOf(slot) }"
            :disabled="placingSlot"
            @click="selectedSlotIndex = slotIndexOf(slot)"
          >
            <span>{{ formatSlotRange(slot) }}</span>
          </button>
        </div>
        <div class="scai-slot-actions">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="placingSlot || !slotPrompt.openSlots.length || !selectedSlotIndex"
            @click="placeInSlot"
          >
            {{ placingSlot ? 'Assigning…' : 'Assign to open slot' }}
          </button>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="placingSlot" @click="dismissSlotPrompt">
            Later
          </button>
        </div>
        <div v-if="slotError" class="scai-error">{{ slotError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  organizationId: { type: [Number, String], required: true },
  client: { type: Object, required: true },
  /** Pre-selected provider when opening from roster context */
  initialProviderUserId: { type: Number, default: null }
});

const emit = defineEmits(['updated']);

const providerSelectId = `scai-provider-${Math.random().toString(36).slice(2, 9)}`;
const loading = ref(false);
const loadError = ref('');
const actionError = ref('');
const providers = ref([]);
const selectedProviderUserId = ref('');
const savingKey = ref('');
const slotPrompt = ref(null);
const selectedSlotIndex = ref(null);
const placingSlot = ref(false);
const slotError = ref('');
const yearUpdateNotice = ref('');

const providerOptions = computed(() => providers.value || []);

const selectedProvider = computed(() => {
  const pid = Number(selectedProviderUserId.value || 0);
  if (!pid) return null;
  return providers.value.find((p) => Number(p.provider_user_id) === pid) || null;
});

const visibleWorkDays = computed(() => {
  const prov = selectedProvider.value;
  if (!prov) return [];
  const assigned = new Set((prov.assigned_days || []).map((d) => String(d)));
  return (prov.work_days || []).filter((d) => {
    const day = String(d.day_of_week || '');
    if (assigned.has(day)) return true;
    const avail = d.slots_available;
    if (avail == null) return false;
    return Number(avail) > 0;
  });
});

const providerDisplayName = (prov) => {
  const name = [prov?.first_name, prov?.last_name].filter(Boolean).join(' ').trim();
  return name || `Provider ${prov?.provider_user_id || ''}`.trim();
};

const shortDay = (day) => {
  const map = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  return map[String(day)] || String(day || '').slice(0, 3);
};

const formatTime = (t) => {
  const s = String(t || '').slice(0, 8);
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return '';
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${ampm}`;
};

const dayHours = (day) => {
  const a = formatTime(day?.start_time);
  const b = formatTime(day?.end_time);
  if (a && b) return `${a}–${b}`;
  const avail = day?.slots_available;
  if (avail != null) return `${avail} open`;
  return '';
};

const dayTitle = (day) => {
  const hours = dayHours(day);
  const avail = day?.slots_available == null ? '' : ` · ${day.slots_available} slot(s) available`;
  return `${day.day_of_week}${hours ? ` ${hours}` : ''}${avail}`;
};

const formatSlotRange = (slot) => {
  const a = formatTime(slot?.start_time);
  const b = formatTime(slot?.end_time);
  if (a && b) return `${a} – ${b}`;
  return 'Time TBD';
};

const saveKey = (providerUserId, day) => `${providerUserId}:${day}`;

const isAssigned = (day) => (selectedProvider.value?.assigned_days || []).includes(String(day));

const slotIndexOf = (slot) => {
  const all = slotPrompt.value?._allSlots || [];
  if (slot?.slot_index != null) return Number(slot.slot_index);
  const byId = all.findIndex((s) => slot?.id && Number(s.id) === Number(slot.id));
  if (byId >= 0) return byId + 1;
  const list = slotPrompt.value?.openSlots || [];
  const amongOpen = list.indexOf(slot);
  return amongOpen >= 0 ? amongOpen + 1 : null;
};

const describeClientStatusUpdate = (update) => {
  if (!update) return '';
  const parts = [];
  if (update.year_advanced && update.school_year) {
    parts.push(`Advanced to ${update.school_year}${update.grade ? ` (Grade ${update.grade})` : ''}`);
  }
  if (update.client_status_key === 'current') {
    parts.push('Client promoted to Current');
  } else if (update.client_status_key === 'pending' && update.doc_compliance_ok === false) {
    const missing = (update.doc_status_missing || []).join(', ');
    parts.push(`Client stayed Pending${missing ? ` — missing: ${missing}` : ' — documents needed'}`);
  }
  return parts.join(' · ');
};

const syncSelectedProvider = () => {
  const list = providers.value || [];
  if (!list.length) {
    selectedProviderUserId.value = '';
    return;
  }
  const current = Number(selectedProviderUserId.value || 0);
  if (current && list.some((p) => Number(p.provider_user_id) === current)) return;
  const hint = Number(props.initialProviderUserId || props.client?.provider_id || 0);
  if (hint && list.some((p) => Number(p.provider_user_id) === hint)) {
    selectedProviderUserId.value = String(hint);
    return;
  }
  const withAssignment = list.find((p) => (p.assigned_days || []).length);
  selectedProviderUserId.value = withAssignment
    ? String(withAssignment.provider_user_id)
    : String(list[0].provider_user_id);
};

const load = async () => {
  const orgId = Number(props.organizationId);
  const clientId = Number(props.client?.id);
  if (!orgId || !clientId) {
    loadError.value = 'Missing school or client.';
    return;
  }
  loading.value = true;
  loadError.value = '';
  actionError.value = '';
  slotPrompt.value = null;
  yearUpdateNotice.value = '';
  try {
    const params = {};
    const hint = Number(props.initialProviderUserId || props.client?.provider_id || 0);
    if (hint) params.providerUserId = hint;
    const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/day-assignment-context`, {
      params,
      skipGlobalLoading: true
    });
    const list = Array.isArray(r.data?.providers) ? r.data.providers : [];
    providers.value = list;
    syncSelectedProvider();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load providers';
    providers.value = [];
  } finally {
    loading.value = false;
  }
};

const onProviderChange = () => {
  actionError.value = '';
  slotPrompt.value = null;
  selectedSlotIndex.value = null;
};

const toggleDay = async (prov, day) => {
  const serviceDay = String(day?.day_of_week || '');
  const providerUserId = Number(prov?.provider_user_id || 0);
  if (!serviceDay || !providerUserId || savingKey.value) return;
  const nextAssigned = !isAssigned(serviceDay);
  savingKey.value = saveKey(providerUserId, serviceDay);
  actionError.value = '';
  slotError.value = '';
  yearUpdateNotice.value = '';
  try {
    const orgId = Number(props.organizationId);
    const clientId = Number(props.client?.id);
    const r = await api.post(
      `/school-portal/${orgId}/clients/${clientId}/assigned-day`,
      { providerUserId, serviceDay, assigned: nextAssigned },
      { skipGlobalLoading: true }
    );
    yearUpdateNotice.value = describeClientStatusUpdate(r.data?.client_status_update);
    const nextDays = Array.isArray(r.data?.assigned_days)
      ? r.data.assigned_days
      : nextAssigned
        ? [...new Set([...(prov.assigned_days || []), serviceDay])]
        : (prov.assigned_days || []).filter((d) => d !== serviceDay);

    providers.value = providers.value.map((p) =>
      Number(p.provider_user_id) === providerUserId ? { ...p, assigned_days: nextDays } : p
    );

    emit('updated', {
      clientId,
      providerUserId,
      assignedDays: nextDays,
      serviceDay,
      assigned: nextAssigned,
      providers: providers.value
    });

    if (nextAssigned) {
      const openSlots = Array.isArray(r.data?.open_slots) ? r.data.open_slots : [];
      const allSlots = Array.isArray(r.data?.soft_schedule?.slots) ? r.data.soft_schedule.slots : [];
      const firstOpen = openSlots[0] || null;
      const firstIndex =
        firstOpen?.slot_index != null
          ? Number(firstOpen.slot_index)
          : firstOpen
            ? allSlots.findIndex(
                (s) =>
                  (firstOpen.id && Number(s.id) === Number(firstOpen.id)) ||
                  (s.start_time === firstOpen.start_time &&
                    s.end_time === firstOpen.end_time &&
                    !s.client_id)
              ) + 1
            : null;
      slotPrompt.value = {
        providerUserId,
        providerName: providerDisplayName(prov),
        serviceDay,
        openSlots,
        _allSlots: allSlots
      };
      selectedSlotIndex.value = firstIndex > 0 ? firstIndex : null;
    } else if (
      slotPrompt.value?.serviceDay === serviceDay &&
      Number(slotPrompt.value?.providerUserId) === providerUserId
    ) {
      slotPrompt.value = null;
      selectedSlotIndex.value = null;
    }
  } catch (e) {
    actionError.value = e.response?.data?.error?.message || 'Failed to update assigned day';
  } finally {
    savingKey.value = '';
  }
};

const dismissSlotPrompt = () => {
  slotPrompt.value = null;
  selectedSlotIndex.value = null;
};

const placeInSlot = async () => {
  if (!slotPrompt.value || !selectedSlotIndex.value) return;
  placingSlot.value = true;
  slotError.value = '';
  try {
    const orgId = Number(props.organizationId);
    const clientId = Number(props.client?.id);
    await api.post(
      `/school-portal/${orgId}/clients/${clientId}/place-in-open-slot`,
      {
        providerUserId: slotPrompt.value.providerUserId,
        serviceDay: slotPrompt.value.serviceDay,
        slotIndex: selectedSlotIndex.value
      },
      { skipGlobalLoading: true }
    );
    dismissSlotPrompt();
  } catch (e) {
    slotError.value = e.response?.data?.error?.message || 'Failed to place client in slot';
  } finally {
    placingSlot.value = false;
  }
};

onMounted(load);
watch(
  () => [props.organizationId, props.client?.id],
  () => load()
);
</script>

<style scoped>
.scai {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.scai-provider-row,
.scai-days {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scai-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(29, 38, 51, 0.55);
}
.scai-select {
  min-width: 180px;
  max-width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #d7e0d9);
  font-size: 13px;
  background: #fff;
}
.scai-day-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scai-day-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 64px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #c9d6cc);
  background: #fff;
  color: var(--text, #1f2a24);
  cursor: pointer;
  text-align: left;
}
.scai-day-chip:hover:not(:disabled) {
  border-color: #2f6b4f;
}
.scai-day-chip.active {
  background: #1f5c45;
  border-color: #1f5c45;
  color: #fff;
}
.scai-day-chip:disabled {
  opacity: 0.65;
  cursor: wait;
}
.scai-day-short {
  font-weight: 800;
  font-size: 0.85rem;
}
.scai-day-meta {
  font-size: 0.65rem;
  opacity: 0.85;
}
.scai-muted {
  color: var(--text-secondary, #5b6b60);
  font-size: 12px;
}
.scai-error {
  color: #b42318;
  font-size: 12px;
}
.scai-notice {
  color: #1f5c45;
  font-size: 12px;
}
.scai-slot-prompt {
  margin-top: 4px;
  padding: 10px;
  border: 1px solid var(--border, #d7e0d9);
  border-radius: 10px;
  background: #fff;
}
.scai-slot-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 6px;
}
.scai-slot-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.scai-slot-option {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #c9d6cc);
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.scai-slot-option.selected {
  border-color: #1f5c45;
  background: rgba(31, 92, 69, 0.08);
}
.scai-slot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
