<template>
  <div class="rail-editor">
    <div class="rail-editor-actions">
      <button v-if="!editing" type="button" :disabled="loading" @click="$emit('start')">Edit layout</button>
      <template v-else>
        <button type="button" :disabled="saving" @click="$emit('save')">{{ saving ? 'Saving…' : 'Save order' }}</button>
        <button type="button" :disabled="saving" @click="$emit('cancel')">Cancel</button>
        <button type="button" :disabled="saving" @click="$emit('reset')">Reset</button>
      </template>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup>
defineProps({ editing: Boolean, loading: Boolean, saving: Boolean, error: String });
defineEmits(['start', 'save', 'cancel', 'reset']);
</script>
<style scoped>
.rail-editor-actions { display: flex; flex-wrap: wrap; gap: 6px; }
button { padding: 5px 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-card, #fff); color: var(--text-primary); cursor: pointer; font: inherit; font-size: 12px; }
button:disabled { opacity: .5; cursor: default; }
p { max-width: 240px; font-size: 12px; color: var(--error, #b91c1c); }
</style>
