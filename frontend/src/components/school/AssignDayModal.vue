<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop role="dialog" aria-modal="true" aria-labelledby="assign-day-title">
      <div class="modal-header">
        <div class="header-left">
          <div class="title-row">
            <strong id="assign-day-title">Assigned day</strong>
          </div>
          <div class="sub">
            <span class="muted">Client:</span>
            <span class="mono">{{ clientLabel }}</span>
            <span v-if="providers.length" class="muted">·</span>
            <span v-if="providers.length">{{ providers.length }} provider{{ providers.length === 1 ? '' : 's' }}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>

        <template v-else>
          <p class="hint">
            Select the day(s) each provider sees this client. Only days on that provider’s work schedule are shown.
          </p>

          <div v-if="!providers.length" class="empty">No editable providers found for this client.</div>

          <div
            v-for="prov in providers"
            :key="prov.provider_user_id"
            class="provider-block"
          >
            <div class="provider-heading">{{ providerDisplayName(prov) }}</div>

            <div v-if="!(prov.work_days || []).length" class="empty small">
              No active work days at this school yet. Set their schedule first.
            </div>

            <div v-else class="day-grid" role="group" :aria-label="`${providerDisplayName(prov)} work days`">
              <button
                v-for="day in prov.work_days"
                :key="`${prov.provider_user_id}-${day.day_of_week}`"
                type="button"
                class="day-chip"
                :class="{
                  active: isAssigned(prov, day.day_of_week),
                  busy: savingKey === saveKey(prov.provider_user_id, day.day_of_week)
                }"
                :disabled="!!savingKey"
                :title="dayTitle(day)"
                @click="toggleDay(prov, day)"
              >
                <span class="day-short">{{ shortDay(day.day_of_week) }}</span>
                <span class="day-meta">{{ dayHours(day) }}</span>
              </button>
            </div>
          </div>

          <div v-if="actionError" class="error action-error">{{ actionError }}</div>

          <div v-if="slotPrompt" class="slot-prompt" role="region" aria-label="Soft schedule slot">
            <div class="slot-prompt-title">
              Place on {{ slotPrompt.providerName }}’s soft schedule for {{ slotPrompt.serviceDay }}?
            </div>
            <p class="hint slot-hint">
              Assign this client to an open soft-schedule slot now, or choose Later if the time isn’t known yet.
            </p>

            <div v-if="!slotPrompt.openSlots.length" class="muted">
              No open soft-schedule slots on {{ slotPrompt.serviceDay }}. You can place them later from Days.
            </div>

            <div v-else class="slot-list">
              <button
                v-for="(slot, idx) in slotPrompt.openSlots"
                :key="slot.id || `open-${idx}`"
                type="button"
                class="slot-option"
                :class="{ selected: selectedSlotIndex === slotIndexOf(slot) }"
                :disabled="placingSlot"
                @click="selectedSlotIndex = slotIndexOf(slot)"
              >
                <span class="slot-label">Open slot</span>
                <span class="slot-time">{{ formatSlotRange(slot) }}</span>
              </button>
            </div>

            <div class="slot-actions">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="placingSlot || !slotPrompt.openSlots.length || !selectedSlotIndex"
                @click="placeInSlot"
              >
                {{ placingSlot ? 'Assigning…' : 'Assign to open slot' }}
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="placingSlot"
                @click="dismissSlotPrompt"
              >
                Later
              </button>
            </div>
            <div v-if="slotError" class="error action-error">{{ slotError }}</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  organizationId: { type: [Number, String], required: true },
  client: { type: Object, required: true },
  /** Optional focus / fallback when opening from a single provider id */
  providerUserId: { type: Number, default: null },
  clientLabelMode: { type: String, default: 'codes' }
});

const emit = defineEmits(['close', 'updated']);

const loading = ref(false);
const error = ref('');
const actionError = ref('');
const providers = ref([]);
const savingKey = ref('');
const slotPrompt = ref(null);
const selectedSlotIndex = ref(null);
const placingSlot = ref(false);
const slotError = ref('');

const clientLabel = computed(() => {
  const initials = String(props.client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(props.client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (props.clientLabelMode === 'initials') return initials || code || '—';
  return code || initials || '—';
});

const providerDisplayName = (prov) => {
  const name = [prov?.first_name, prov?.last_name].filter(Boolean).join(' ').trim();
  return name || `Provider ${prov?.provider_user_id || ''}`.trim();
};

const shortDay = (day) => {
  const map = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri'
  };
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
  return '';
};

const dayTitle = (day) => {
  const hours = dayHours(day);
  const avail =
    day?.slots_available == null ? '' : ` · ${day.slots_available} slot(s) available`;
  return `${day.day_of_week}${hours ? ` ${hours}` : ''}${avail}`;
};

const formatSlotRange = (slot) => {
  const a = formatTime(slot?.start_time);
  const b = formatTime(slot?.end_time);
  if (a && b) return `${a} – ${b}`;
  return 'Time TBD';
};

const saveKey = (providerUserId, day) => `${providerUserId}:${day}`;

const isAssigned = (prov, day) => (prov?.assigned_days || []).includes(String(day));

const slotIndexOf = (slot) => {
  const all = slotPrompt.value?._allSlots || [];
  if (slot?.slot_index) return Number(slot.slot_index);
  const byId = all.findIndex((s) => slot?.id && Number(s.id) === Number(slot.id));
  if (byId >= 0) return byId + 1;
  const list = slotPrompt.value?.openSlots || [];
  const amongOpen = list.indexOf(slot);
  return amongOpen >= 0 ? amongOpen + 1 : null;
};

const load = async () => {
  const orgId = Number(props.organizationId);
  const clientId = Number(props.client?.id);
  if (!orgId || !clientId) {
    error.value = 'Missing school or client.';
    return;
  }
  loading.value = true;
  error.value = '';
  actionError.value = '';
  slotPrompt.value = null;
  try {
    const params = {};
    if (props.providerUserId) params.providerUserId = Number(props.providerUserId);
    const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/day-assignment-context`, {
      params,
      skipGlobalLoading: true
    });
    const list = Array.isArray(r.data?.providers) ? r.data.providers : [];
    if (list.length) {
      providers.value = list;
    } else if (r.data?.provider) {
      // Backward-compatible single-provider payload
      providers.value = [
        {
          provider_user_id: r.data.provider.provider_user_id,
          first_name: r.data.provider.first_name,
          last_name: r.data.provider.last_name,
          work_days: Array.isArray(r.data.work_days) ? r.data.work_days : [],
          assigned_days: Array.isArray(r.data.assigned_days) ? r.data.assigned_days : []
        }
      ];
    } else {
      providers.value = [];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load assigned days';
    providers.value = [];
  } finally {
    loading.value = false;
  }
};

const toggleDay = async (prov, day) => {
  const serviceDay = String(day?.day_of_week || '');
  const providerUserId = Number(prov?.provider_user_id || 0);
  if (!serviceDay || !providerUserId || savingKey.value) return;
  const nextAssigned = !isAssigned(prov, serviceDay);
  savingKey.value = saveKey(providerUserId, serviceDay);
  actionError.value = '';
  slotError.value = '';
  try {
    const orgId = Number(props.organizationId);
    const clientId = Number(props.client?.id);
    const r = await api.post(
      `/school-portal/${orgId}/clients/${clientId}/assigned-day`,
      { providerUserId, serviceDay, assigned: nextAssigned },
      { skipGlobalLoading: true }
    );
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
  slotError.value = '';
};

const placeInSlot = async () => {
  if (!slotPrompt.value || !selectedSlotIndex.value || placingSlot.value) return;
  placingSlot.value = true;
  slotError.value = '';
  try {
    const orgId = Number(props.organizationId);
    const clientId = Number(props.client?.id);
    await api.post(
      `/school-portal/${orgId}/clients/${clientId}/place-in-open-slot`,
      {
        providerUserId: Number(slotPrompt.value.providerUserId),
        serviceDay: slotPrompt.value.serviceDay,
        slotIndex: Number(selectedSlotIndex.value)
      },
      { skipGlobalLoading: true }
    );
    dismissSlotPrompt();
  } catch (e) {
    slotError.value = e.response?.data?.error?.message || 'Failed to place in soft schedule';
  } finally {
    placingSlot.value = false;
  }
};

watch(
  () => [props.client?.id, props.providerUserId, props.organizationId],
  () => {
    load();
  }
);

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 20, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10050;
  padding: 16px;
}
.modal {
  width: min(560px, 100%);
  max-height: min(90vh, 820px);
  overflow: auto;
  background: var(--bg, #fff);
  border: 1px solid var(--border, #d7e0d9);
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #d7e0d9);
  background: var(--bg-alt, #f4f7f5);
  position: sticky;
  top: 0;
  z-index: 1;
}
.title-row {
  font-size: 1rem;
}
.sub {
  margin-top: 4px;
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.muted {
  color: var(--text-secondary, #5b6b60);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}
.modal-body {
  padding: 16px;
}
.hint {
  margin: 0 0 12px;
  color: var(--text-secondary, #5b6b60);
  font-size: 0.9rem;
  line-height: 1.4;
}
.provider-block {
  padding: 12px;
  border: 1px solid var(--border, #d7e0d9);
  border-radius: 12px;
  margin-bottom: 10px;
  background: #fff;
}
.provider-heading {
  font-weight: 800;
  margin-bottom: 10px;
  color: var(--text, #1f2a24);
}
.empty {
  padding: 12px;
  border: 1px dashed var(--border, #d7e0d9);
  border-radius: 10px;
  color: var(--text-secondary, #5b6b60);
  font-size: 0.9rem;
}
.empty.small {
  padding: 8px 10px;
  margin: 0;
}
.day-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.day-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 72px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #c9d6cc);
  background: #fff;
  color: var(--text, #1f2a24);
  cursor: pointer;
  text-align: left;
}
.day-chip:hover:not(:disabled) {
  border-color: #2f6b4f;
}
.day-chip.active {
  background: #1f5c45;
  border-color: #1f5c45;
  color: #fff;
}
.day-chip:disabled {
  opacity: 0.65;
  cursor: wait;
}
.day-short {
  font-weight: 800;
  font-size: 0.95rem;
}
.day-meta {
  font-size: 0.7rem;
  opacity: 0.85;
  max-width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.error {
  color: #b42318;
  font-size: 0.9rem;
}
.action-error {
  margin-top: 10px;
}
.slot-prompt {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #c9d6cc;
  background: #f4f7f5;
}
.slot-prompt-title {
  font-weight: 800;
  margin-bottom: 4px;
}
.slot-hint {
  margin-bottom: 10px;
}
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.slot-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #c9d6cc;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.slot-option.selected {
  border-color: #1f5c45;
  box-shadow: inset 0 0 0 1px #1f5c45;
}
.slot-label {
  font-weight: 700;
  font-size: 0.85rem;
}
.slot-time {
  font-size: 0.85rem;
  color: var(--text-secondary, #5b6b60);
}
.slot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
