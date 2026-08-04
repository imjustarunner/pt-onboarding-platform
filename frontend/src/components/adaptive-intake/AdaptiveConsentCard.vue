<template>
  <article
    class="ai-consent-card"
    :class="{ 'ai-consent-card--signed': signed || agreed }"
  >
    <div class="ai-consent-card-icon" aria-hidden="true">{{ icon || '📄' }}</div>
    <div>
      <h3 class="ai-consent-card-title">{{ title }}</h3>
      <p v-if="description" class="ai-consent-card-desc">{{ description }}</p>
      <div class="ai-consent-card-actions">
        <button
          v-if="canView"
          type="button"
          class="df-btn df-btn-secondary"
          style="padding: 0.4rem 0.75rem; font-size: 0.82rem;"
          @click="$emit('view')"
        >
          View Document
        </button>
        <span v-if="signed" class="ai-signature-captured">✓ Signed</span>
        <span v-else-if="agreed" class="ai-signature-captured">✓ Agreed</span>
      </div>
    </div>
    <label v-if="!signed" class="ai-consent-agree">
      <input
        type="checkbox"
        :checked="agreed"
        @change="$emit('update:agreed', $event.target.checked)"
      />
      <span>I Agree</span>
    </label>
  </article>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  canView: { type: Boolean, default: true },
  agreed: { type: Boolean, default: false },
  signed: { type: Boolean, default: false }
});

defineEmits(['view', 'update:agreed']);
</script>

<style scoped>
.ai-consent-agree {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--df-primary);
  white-space: nowrap;
}
</style>
