<template>
  <DigitalFormShell
    class="ai-shell-host"
    :branding="branding"
    :program-title-override="programTitle"
    :form-title-override="formTitle"
    :form-subtitle="formSubtitle"
    :progress-steps="sidebarSteps"
    :progress-index="progressIndex"
    :intake-sidebar-steps="coverMode ? [] : sidebarSteps"
    :intake-sidebar-step-index="progressIndex"
    :show-intake-sidebar-security="!coverMode && sidebarSteps.length > 0"
    :decor-hero-url="decorHeroUrl"
    :decor-hero-alt="decorHeroAlt"
    :decor-hero-frame-style="decorHeroFrameStyle"
    :decor-hero-image-position="decorHeroImagePosition"
    :cover-mode="coverMode"
    :hide-sidebar="hideSidebar"
    :wide="wide"
    :trust-items="trustItems || adaptiveTrustItems"
    :quote="''"
    :show-header="showHeader"
    :contact-phone-display="contactPhoneDisplay"
    :contact-phone-tel="contactPhoneTel"
    :contact-email="contactEmail"
    :show-contact-support-action="showContactSupportAction"
    :contact-support-label="contactSupportLabel"
    :scenic-sidebar-url="scenicSidebarUrl"
    @contact-support="$emit('contact-support')"
  >
    <template v-if="$slots['header-left']" #header-left>
      <slot name="header-left" />
    </template>
    <template v-if="$slots['header-right']" #header-right>
      <slot name="header-right" />
    </template>

    <div class="ai-layout">
      <div class="ai-layout-main">
        <div v-if="pathwayBadge && !coverMode" class="ai-pathway-badge">{{ pathwayBadge }}</div>
        <slot />
      </div>
    </div>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </DigitalFormShell>
</template>

<script setup>
import { DigitalFormShell } from '../digital-form';
import '../../styles/adaptive-intake.css';

const adaptiveTrustItems = [
  { icon: 'shield', label: 'Your information is secure' },
  { icon: 'lock', label: 'HIPAA Protected' },
  { icon: 'check', label: 'Only takes a few minutes' }
];

defineProps({
  branding: { type: Object, default: null },
  programTitle: { type: String, default: '' },
  formTitle: { type: String, default: '' },
  formSubtitle: { type: String, default: 'Intake' },
  progressSteps: { type: Array, default: () => [] },
  progressIndex: { type: Number, default: 0 },
  sidebarSteps: { type: Array, default: () => [] },
  decorHeroUrl: { type: String, default: '' },
  decorHeroAlt: { type: String, default: '' },
  decorHeroFrameStyle: { type: String, default: 'preframed' },
  decorHeroImagePosition: { type: String, default: 'center center' },
  pathwayBadge: { type: String, default: '' },
  coverMode: { type: Boolean, default: false },
  hideSidebar: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  trustItems: { type: Array, default: undefined },
  contactPhoneDisplay: { type: String, default: '' },
  contactPhoneTel: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  showContactSupportAction: { type: Boolean, default: false },
  contactSupportLabel: { type: String, default: 'Send a message' },
  scenicSidebarUrl: { type: String, default: '' }
});

defineEmits(['contact-support']);
</script>
