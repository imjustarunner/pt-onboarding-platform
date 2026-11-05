<template>
  <div class="merge">
    <p class="lead">Checked fields use the paste. Unchecked fields keep what is already on the file.</p>
    <div v-for="row in rows" :key="row.key" class="row">
      <div class="label">{{ row.label }}</div>
      <div class="values">
        <div>
          <span>On file</span>
          <strong>{{ row.current || 'Empty' }}</strong>
        </div>
        <div>
          <span>Pasted</span>
          <strong>{{ row.incoming || 'Empty' }}</strong>
        </div>
      </div>
      <p v-if="row.same" class="same">Both match. The file value is kept.</p>
      <label v-else-if="row.incoming" class="switch">
        <input
          type="checkbox"
          :checked="row.useIncoming"
          @change="$emit('toggle', row.key, $event.target.checked)"
        />
        Use pasted value
      </label>
      <p v-else class="same">Nothing new was pasted. The file value is kept.</p>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="$emit('save')">
      {{ saving ? 'Saving…' : 'Save chosen demographics' }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
});
defineEmits(['save', 'toggle']);
</script>

<style scoped>
.merge { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.lead { margin: 0; color: #475569; font-size: 0.88rem; }
.row { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
.label { font-weight: 700; margin-bottom: 6px; }
.values { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.values span { display: block; color: #64748b; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
.switch { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-weight: 600; }
.same { margin: 8px 0 0; color: #64748b; font-size: 0.85rem; }
.error { color: #b91c1c; font-size: 0.88rem; margin: 0; }
</style>
