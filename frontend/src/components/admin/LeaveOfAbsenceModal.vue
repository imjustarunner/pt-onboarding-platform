<template>
  <div v-if="show" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Record Leave of Absence</h2>
      <p v-if="user" class="muted" style="margin-bottom: 16px;">
        {{ user.first_name }} {{ user.last_name }}
      </p>
      <div class="form-group">
        <label>Leave type</label>
        <select v-model="leaveType" class="form-input">
          <option value="">— Select —</option>
          <option value="maternity">Maternity</option>
          <option value="paternity">Paternity</option>
          <option value="medical">Medical</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Departure date</label>
        <input v-model="departureDate" type="date" class="form-input" />
      </div>
      <div class="form-group">
        <label>Return date</label>
        <input v-model="returnDate" type="date" class="form-input" />
      </div>
      <div class="modal-actions">
        <button
          v-if="hasExistingLeave"
          type="button"
          class="btn btn-secondary"
          @click="clearLeave"
          :disabled="saving"
        >
          Clear leave
        </button>
        <div style="flex: 1;"></div>
        <button type="button" class="btn btn-secondary" @click="$emit('close')">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" @click="save" :disabled="saving || !isValid">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  show: { type: Boolean, default: false },
  userId: { type: Number, required: true },
  user: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const leaveType = ref('');
const departureDate = ref('');
const returnDate = ref('');
const saving = ref(false);

const hasExistingLeave = computed(() => {
  return !!(leaveType.value || departureDate.value || returnDate.value);
});

const isValid = computed(() => {
  return departureDate.value && returnDate.value;
});

watch(() => [props.show, props.userId], async ([newShow, newUserId]) => {
  if (newShow && newUserId) {
    try {
      const { data } = await api.get(`/users/${newUserId}/leave-of-absence`);
      leaveType.value = data.leaveType || '';
      departureDate.value = data.departureDate || '';
      returnDate.value = data.returnDate || '';
    } catch {
      leaveType.value = '';
      departureDate.value = '';
      returnDate.value = '';
    }
  }
}, { immediate: true });

const save = async () => {
  if (!isValid.value || saving.value) return;
  try {
    saving.value = true;
    await api.put(`/users/${props.userId}/leave-of-absence`, {
      leaveType: leaveType.value || null,
      departureDate: departureDate.value || null,
      returnDate: returnDate.value || null
    });
    emit('saved');
    emit('close');
  } catch (e) {
    const msg = e.response?.data?.error?.message || 'Failed to save leave of absence';
    alert(msg);
  } finally {
    saving.value = false;
  }
};

const clearLeave = async () => {
  if (!confirm('Clear all leave of absence dates for this provider?')) return;
  try {
    saving.value = true;
    await api.put(`/users/${props.userId}/leave-of-absence`, {
      leaveType: null,
      departureDate: null,
      returnDate: null
    });
    leaveType.value = '';
    departureDate.value = '';
    returnDate.value = '';
    emit('saved');
    emit('close');
  } catch (e) {
    const msg = e.response?.data?.error?.message || 'Failed to clear leave';
    alert(msg);
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary, white);
  padding: 32px;
  border-radius: 8px;
  max-width: 420px;
  width: 90%;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 8px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 14px;
}

.muted {
  color: var(--text-secondary, #666);
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 24px;
}
</style>
