<template>
  <div
    class="df-page"
    :class="{
      'df-page--preview': preview,
      'df-page--embedded': embedded,
      'df-page--full-bleed': isFullBleed,
      'df-page--form-mode': isFormMode
    }"
    :style="shellVars"
  >
    <div
      class="df-shell"
      :class="{
        'df-shell--preview': preview,
        'df-shell--embedded': embedded,
        'df-shell--cover-mode': coverMode,
        'df-shell--full-bleed': isFullBleed,
        'df-shell--form-mode': isFormMode,
        'df-shell--hide-sidebar': hideSidebar
      }"
    >
      <aside v-if="!hideSidebar && !embedded" class="df-sidebar" aria-label="Program branding">
        <div class="df-sidebar-bg" aria-hidden="true" />
        <div v-if="!isFormMode" class="df-sidebar-wave" aria-hidden="true" />
        <div class="df-sidebar-inner" :class="{ 'df-sidebar-inner--rail': isFormMode }">
          <div v-if="coverMode" class="df-sidebar-hero">
            <div class="df-sidebar-quote-mark" aria-hidden="true">“</div>
            <p v-if="quote" class="df-sidebar-quote">{{ quote }}</p>
          </div>
          <div v-else-if="isFormMode" class="df-sidebar-rail">
            <img
              v-if="resolvedLogo"
              class="df-sidebar-rail-logo"
              :src="resolvedLogo"
              :alt="programTitle || 'Organization logo'"
            />
            <p class="df-sidebar-rail-title">{{ displayFormTitle }}</p>
            <p v-if="formSubtitle" class="df-sidebar-rail-subtitle">{{ formSubtitle }}</p>
          </div>
          <template v-else>
            <img
              v-if="resolvedLogo"
              class="df-sidebar-logo"
              :src="resolvedLogo"
              :alt="programTitle || 'Organization logo'"
            />
            <div>
              <div class="df-sidebar-program">{{ programTitle }}</div>
              <div v-if="formSubtitle" class="df-sidebar-subtitle">{{ formSubtitle }}</div>
            </div>
          </template>

          <div v-if="coverMode" class="df-sidebar-spacer" />

          <div v-if="coverMode" class="df-trust-list">
            <div v-for="item in trustItems" :key="item.label" class="df-trust-item">
              <span class="df-trust-icon" aria-hidden="true">
                <svg v-if="item.icon === 'lock'" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
                <svg v-else-if="item.icon === 'check'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>
                <svg v-else viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              <span class="df-trust-label">{{ item.label }}</span>
            </div>
          </div>
        </div>
      </aside>

      <div class="df-main">
        <header v-if="showHeader" class="df-main-header">
          <div class="df-main-header-left">
            <slot name="header-left" />
          </div>
          <div class="df-main-header-right">
            <slot name="header-right">
              <DigitalFormLanguageToggle
                v-if="showLanguageToggle"
                :model-value="language"
                :show="showLanguageToggle"
                :switching="languageSwitching"
                :disabled="languageDisabled"
                @update:model-value="$emit('update:language', $event)"
              />
            </slot>
          </div>
        </header>

        <DigitalFormProgress
          v-if="progressSteps.length && !coverMode"
          :steps="progressSteps"
          :active-index="progressIndex"
        />

        <div
          class="df-main-body"
          :class="{
            'df-main-body--wide': wide,
            'df-main-body--cover': coverMode,
            'df-main-body--form': isFormMode
          }"
        >
          <slot />
        </div>

        <footer v-if="$slots.footer" class="df-main-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import '../../styles/digital-form.css';
import DigitalFormLanguageToggle from './DigitalFormLanguageToggle.vue';
import DigitalFormProgress from './DigitalFormProgress.vue';
import { useDigitalFormTheme } from './useDigitalFormTheme';

const props = defineProps({
  branding: { type: Object, default: null },
  programTitleOverride: { type: String, default: '' },
  /** Intake link / document title shown in the thin rail during form fill */
  formTitleOverride: { type: String, default: '' },
  formSubtitle: { type: String, default: 'Intake & Registration' },
  quote: {
    type: String,
    default: 'Investing in skills today builds stronger tomorrows.'
  },
  logoUrlOverride: { type: String, default: '' },
  progressSteps: { type: Array, default: () => [] },
  progressIndex: { type: Number, default: 0 },
  language: { type: String, default: 'en' },
  showLanguageToggle: { type: Boolean, default: false },
  languageSwitching: { type: Boolean, default: false },
  languageDisabled: { type: Boolean, default: false },
  coverMode: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  hideSidebar: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  wide: { type: Boolean, default: false },
  trustItems: {
    type: Array,
    default: () => [
      { icon: 'shield', label: 'Your information is secure' },
      { icon: 'lock', label: 'HIPAA & FERPA Protected' },
      { icon: 'check', label: 'Only takes a few minutes' }
    ]
  }
});

defineEmits(['update:language']);

const { shellVars, logoUrl, programTitle: themeProgramTitle } = useDigitalFormTheme(
  computed(() => props.branding)
);

const programTitle = computed(
  () => props.programTitleOverride || themeProgramTitle.value || 'Intake & Registration'
);

const resolvedLogo = computed(() => props.logoUrlOverride || logoUrl.value || '');

const isFullBleed = computed(() => !props.preview && !props.embedded);

const isFormMode = computed(
  () => isFullBleed.value && !props.coverMode
);

const displayFormTitle = computed(
  () => String(props.formTitleOverride || programTitle.value || 'Intake form').trim()
);
</script>
