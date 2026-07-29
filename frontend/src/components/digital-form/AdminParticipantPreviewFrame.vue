<template>
  <DigitalFormShell
    :branding="branding"
    :program-title-override="programTitle"
    :form-subtitle="subtitle"
    :preview="true"
    :cover-mode="false"
    :show-language-toggle="false"
    :progress-steps="progressSteps"
    :progress-index="0"
    :quote="quote"
  >
    <slot />
  </DigitalFormShell>
</template>

<script setup>
import { computed } from 'vue';
import DigitalFormShell from './DigitalFormShell.vue';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  brandingOverride: { type: Object, default: null },
  programTitle: { type: String, default: 'Participant Preview' },
  subtitle: { type: String, default: 'How this step looks to families' },
  stepLabel: { type: String, default: 'Step preview' },
  quote: { type: String, default: 'Investing in skills today builds stronger tomorrows.' }
});

const brandingStore = useBrandingStore();

const branding = computed(() => {
  if (props.brandingOverride) return props.brandingOverride;
  return {
    programTitle: props.programTitle,
    agencyName: brandingStore.displayName || '',
    logoUrl: brandingStore.displayLogoUrl || '',
    colorPalette: {
      primary: brandingStore.primaryColor || '#1e4d3b',
      secondary: brandingStore.secondaryColor || '#2d6a4f',
      accent: brandingStore.accentColor || '#c4a574',
      backgroundColor: brandingStore.backgroundColor || '#f7f5f2',
      textPrimary: brandingStore.textPrimaryColor || '#1a2e24',
      textMuted: brandingStore.textMutedColor || '#5c6b63'
    },
    fontFamily: null
  };
});

const progressSteps = computed(() => [
  { id: 'preview', label: props.stepLabel || 'Preview' }
]);
</script>
