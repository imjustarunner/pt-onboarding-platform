<template>
  <div class="abs-shell" :style="shellVars">
    <header class="abs-header">
      <div class="abs-brand">
        <img
          v-if="logoUrl"
          class="abs-logo"
          :src="logoUrl"
          :alt="orgName || 'Organization'"
        />
        <div class="abs-brand-text">
          <p class="abs-org">{{ orgName || 'Assessment' }}</p>
          <p v-if="eyebrow" class="abs-eyebrow">{{ eyebrow }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="abs-actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="abs-body">
      <h1 v-if="title" class="abs-title">{{ title }}</h1>
      <p v-if="subtitle" class="abs-subtitle">{{ subtitle }}</p>
      <slot />
    </div>

    <footer v-if="footer || $slots.footer" class="abs-footer">
      <slot name="footer">{{ footer }}</slot>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  footer: { type: String, default: '' },
  organizationSlug: { type: String, default: '' },
  /** Optional override logo */
  logoUrlOverride: { type: String, default: '' },
  orgNameOverride: { type: String, default: '' }
});

const branding = useBrandingStore();

onMounted(() => {
  const slug = String(props.organizationSlug || '').trim();
  if (slug && typeof branding.fetchAgencyTheme === 'function') {
    branding.fetchAgencyTheme(slug).catch(() => {});
  }
});

watch(
  () => props.organizationSlug,
  (slug) => {
    const s = String(slug || '').trim();
    if (s && typeof branding.fetchAgencyTheme === 'function') {
      branding.fetchAgencyTheme(s).catch(() => {});
    }
  }
);

const logoUrl = computed(
  () =>
    props.logoUrlOverride ||
    branding.displayLogoUrl ||
    branding.logoUrl ||
    ''
);
const orgName = computed(
  () =>
    props.orgNameOverride ||
    branding.displayName ||
    branding.agencyName ||
    ''
);

const shellVars = computed(() => ({
  '--abs-primary': branding.primaryColor || '#2c4a3e',
  '--abs-secondary': branding.secondaryColor || '#1b4332',
  '--abs-accent': branding.accentColor || '#d4a574',
  '--abs-bg': branding.backgroundColor || '#f7f4ef',
  '--abs-text': branding.textPrimaryColor || '#14231c',
  '--abs-muted': branding.textMutedColor || '#666666',
  '--abs-font': branding.fontFamily || "Georgia, 'Times New Roman', serif"
}));
</script>

<style scoped>
.abs-shell {
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 0% 0%, color-mix(in srgb, var(--abs-primary) 18%, transparent), transparent 55%),
    linear-gradient(180deg, #fff 0%, var(--abs-bg) 40%);
  color: var(--abs-text);
  font-family: var(--abs-font);
  padding: 1.25rem 1.25rem 3rem;
}

.abs-header {
  max-width: 960px;
  margin: 0 auto 1.5rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 2px solid var(--abs-primary);
  padding-bottom: 1rem;
}

.abs-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.abs-logo {
  max-height: 52px;
  max-width: 160px;
  object-fit: contain;
}

.abs-org {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--abs-primary);
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.abs-eyebrow {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--abs-muted);
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.abs-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.abs-body {
  max-width: 960px;
  margin: 0 auto;
}

.abs-title {
  margin: 0 0 0.35rem;
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  color: var(--abs-text);
}

.abs-subtitle {
  margin: 0 0 1.25rem;
  color: var(--abs-muted);
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.95rem;
}

.abs-footer {
  max-width: 960px;
  margin: 2.5rem auto 0;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--abs-primary) 25%, transparent);
  font-size: 0.8rem;
  color: var(--abs-muted);
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

@media print {
  .abs-shell {
    background: #fff;
    padding: 0;
  }
  .abs-actions {
    display: none !important;
  }
}
</style>
