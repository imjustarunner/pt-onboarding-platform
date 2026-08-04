<template>
  <DigitalFormShell
    class="ai-shell-host"
    :class="{ 'ai-shell-host--with-help': showHelpPanel }"
    :branding="branding"
    :program-title-override="programTitle"
    :form-title-override="formTitle"
    :form-subtitle="formSubtitle"
    :progress-steps="showTopProgress ? progressSteps : []"
    :progress-index="progressIndex"
    :cover-mode="coverMode"
    :hide-sidebar="hideSidebar"
    :wide="wide || showHelpPanel"
    :trust-items="trustItems"
    :show-header="showHeader"
  >
    <template v-if="$slots['header-left']" #header-left>
      <slot name="header-left" />
    </template>
    <template v-if="$slots['header-right']" #header-right>
      <slot name="header-right" />
    </template>

    <div class="ai-layout" :class="{ 'ai-layout--help': showHelpPanel && !coverMode }">
      <div v-if="sidebarSteps.length && !coverMode" class="ai-layout-sidebar-steps df-desktop-only">
        <AdaptiveIntakeSidebarSteps
          :steps="sidebarSteps"
          :active-index="progressIndex"
        />
        <div class="ai-security-badge">
          <span class="ai-security-badge-icon" aria-hidden="true">🔒</span>
          <div>
            <strong>Your information is safe</strong>
            <p>We use industry-standard encryption to protect your privacy.</p>
          </div>
        </div>
      </div>

      <div class="ai-layout-main">
        <div v-if="pathwayBadge && !coverMode" class="ai-pathway-badge">{{ pathwayBadge }}</div>
        <slot />
      </div>

      <AdaptiveIntakeHelpPanel
        v-if="showHelpPanel && !coverMode && helpBlocks.length"
        class="df-desktop-only"
        :blocks="helpBlocks"
      >
        <slot name="help-extra" />
      </AdaptiveIntakeHelpPanel>
    </div>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </DigitalFormShell>
</template>

<script setup>
import { computed } from 'vue';
import { DigitalFormShell } from '../digital-form';
import AdaptiveIntakeSidebarSteps from './AdaptiveIntakeSidebarSteps.vue';
import AdaptiveIntakeHelpPanel from './AdaptiveIntakeHelpPanel.vue';
import '../../styles/adaptive-intake.css';

const props = defineProps({
  branding: { type: Object, default: null },
  programTitle: { type: String, default: '' },
  formTitle: { type: String, default: '' },
  formSubtitle: { type: String, default: 'Intake' },
  progressSteps: { type: Array, default: () => [] },
  progressIndex: { type: Number, default: 0 },
  sidebarSteps: { type: Array, default: () => [] },
  helpBlocks: { type: Array, default: () => [] },
  pathwayBadge: { type: String, default: '' },
  coverMode: { type: Boolean, default: false },
  hideSidebar: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  showTopProgress: { type: Boolean, default: true },
  trustItems: { type: Array, default: undefined }
});

const showHelpPanel = computed(() => Array.isArray(props.helpBlocks) && props.helpBlocks.length > 0);
</script>
