<template>
  <section class="ai-provider-preview">
    <h2 class="ai-page-title" style="font-size: 1.45rem;">{{ title }}</h2>
    <p class="ai-page-lead">{{ lead }}</p>

    <div v-if="loading" class="df-loading">Loading providers…</div>
    <div v-else-if="error" class="df-banner df-banner--warn">{{ error }}</div>
    <div v-else-if="!providers.length" class="df-banner">
      No providers to preview right now. Our team will help match you after you submit.
    </div>
    <div v-else class="ai-provider-grid">
      <button
        v-for="p in providers"
        :key="p.id"
        type="button"
        class="ai-provider-card"
        :class="{ 'ai-provider-card--selected': selectedId === p.id }"
        @click="$emit('update:selectedId', p.id)"
      >
        <h3 class="ai-provider-name">{{ p.displayName || p.name }}</h3>
        <p v-if="p.credentials || p.role" class="ai-provider-meta">{{ p.credentials || p.role }}</p>
        <p v-if="p.specialties?.length" class="ai-provider-meta">{{ p.specialties.slice(0, 3).join(', ') }}</p>
        <p v-if="p.nextAvailable" class="ai-provider-meta">Next available: {{ p.nextAvailable }}</p>
        <p v-if="p.modality" class="ai-provider-meta">{{ p.modality }}</p>
        <span v-if="selectedId === p.id" class="ai-signature-captured">✓ Preferred</span>
      </button>
    </div>
    <p class="ai-page-lead" style="margin-top: 0.85rem; font-size: 0.82rem;">
      Availability may change. Final eligibility may require a full intake or insurance verification.
      Selecting a provider is a preference, not a confirmed assignment.
    </p>
    <button
      v-if="allowSkip"
      type="button"
      class="df-btn df-btn-secondary"
      style="margin-top: 0.5rem;"
      @click="$emit('skip')"
    >
      Skip — let the team choose
    </button>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Optional provider preview' },
  lead: {
    type: String,
    default: 'Based on what you shared, here are providers who may be a fit. You can skip this step.'
  },
  providers: { type: Array, default: () => [] },
  selectedId: { type: [Number, String, null], default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  allowSkip: { type: Boolean, default: true }
});

defineEmits(['update:selectedId', 'skip']);
</script>
