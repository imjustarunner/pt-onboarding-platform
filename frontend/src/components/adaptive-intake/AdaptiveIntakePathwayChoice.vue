<template>
  <div class="ai-pathway">
    <p v-if="eyebrow" class="ai-pathway-eyebrow">{{ eyebrow }}</p>
    <h1 class="ai-pathway-title">{{ title }}</h1>
    <p v-if="subtitle" class="ai-pathway-subtitle">{{ subtitle }}</p>

    <div class="ai-pathway-grid">
      <button
        type="button"
        class="ai-pathway-card"
        :class="{ 'ai-pathway-card--selected': modelValue === 'quick' }"
        :aria-pressed="modelValue === 'quick'"
        @click="choosePathway('quick')"
      >
        <div class="ai-pathway-card-top">
          <span class="ai-pathway-card-icon" aria-hidden="true">⚡</span>
          <span v-if="quick.duration" class="ai-pathway-pill">{{ quick.duration }}</span>
        </div>
        <h2 class="ai-pathway-card-title">{{ quick.title }}</h2>
        <p class="ai-pathway-card-tagline">{{ quick.tagline }}</p>
        <p class="ai-pathway-card-desc">{{ quick.description }}</p>
        <ul v-if="quick.bullets?.length" class="ai-pathway-card-list">
          <li v-for="(b, i) in quick.bullets" :key="i">{{ b }}</li>
        </ul>
        <span class="ai-pathway-card-cta">{{ quick.cta || 'Start Quick Intake →' }}</span>
        <span v-if="quick.footer" class="ai-pathway-card-footer">{{ quick.footer }}</span>
      </button>

      <button
        type="button"
        class="ai-pathway-card"
        :class="{ 'ai-pathway-card--selected': modelValue === 'full' }"
        :aria-pressed="modelValue === 'full'"
        :disabled="!full.enabled"
        @click="choosePathway('full')"
      >
        <div class="ai-pathway-card-top">
          <span class="ai-pathway-card-icon" aria-hidden="true">📋</span>
          <span v-if="full.duration" class="ai-pathway-pill">{{ full.duration }}</span>
        </div>
        <h2 class="ai-pathway-card-title">{{ full.title }}</h2>
        <p class="ai-pathway-card-tagline">{{ full.tagline }}</p>
        <p class="ai-pathway-card-desc">{{ full.description }}</p>
        <ul v-if="full.bullets?.length" class="ai-pathway-card-list">
          <li v-for="(b, i) in full.bullets" :key="i">{{ b }}</li>
        </ul>
        <span class="ai-pathway-card-cta">{{ full.enabled ? (full.cta || 'Start Full Intake →') : (full.disabledReason || 'Not available yet') }}</span>
        <span v-if="full.footer" class="ai-pathway-card-footer">{{ full.footer }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  title: { type: String, default: "Welcome! We're glad you're here." },
  subtitle: {
    type: String,
    default: 'Choose the type of intake that works best for you. You can always add more details later.'
  },
  quick: {
    type: Object,
    default: () => ({
      title: 'Quick Prospective',
      tagline: 'A short form to get you started.',
      description: 'Perfect if you are exploring services and want our team to follow up.',
      duration: '~ 5–10 min',
      bullets: ['Basic contact information', 'Reason for seeking support', 'Preferred communication'],
      cta: 'Start Quick Intake →',
      footer: 'You can add more details later.'
    })
  },
  full: {
    type: Object,
    default: () => ({
      title: 'In-Depth Intake Packet',
      tagline: 'A comprehensive intake experience.',
      description: 'Best when you are ready to provide full information for personalized care.',
      duration: '~ 25–35 min',
      bullets: ['All basic information', 'Detailed history & concerns', 'Documents & signatures'],
      cta: 'Start Full Intake →',
      footer: 'More complete = better personalized care.',
      enabled: true
    })
  }
});

const emit = defineEmits(['update:modelValue', 'continue']);

/** Card click, CTA text, and Continue all start the chosen pathway immediately. */
function choosePathway(pathway) {
  const choice = String(pathway || '').trim();
  if (!choice) return;
  if (choice === 'full' && !props.full?.enabled) return;
  emit('update:modelValue', choice);
  emit('continue', choice);
}
</script>
