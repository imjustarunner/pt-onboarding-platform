<template>
  <div class="sbep-layout">
    <header class="sbep-layout-header">
      <div class="sbep-layout-header-inner">
        <div class="sbep-layout-brand">
          <div v-if="$slots.logo" class="sbep-layout-logo-wrap">
            <slot name="logo" />
          </div>
          <div class="sbep-layout-titles">
            <p class="sbep-layout-kicker">{{ kicker }}</p>
            <h1 class="sbep-layout-title">{{ title }}</h1>
            <p v-if="subtitle" class="sbep-layout-sub">{{ subtitle }}</p>
          </div>
        </div>
        <div class="sbep-layout-actions">
          <slot name="actions" />
        </div>
      </div>
    </header>
    <div class="sbep-layout-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  kicker: { type: String, default: 'Skill Builders' }
});
</script>

<style scoped>
.sbep-layout {
  width: 100%;
}
.sbep-layout-header {
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.08) 0%, rgba(255, 255, 255, 0.95) 60%);
  border-bottom: 1px solid var(--border, #e2e8f0);
  margin: 0 0 20px;
  padding: 20px 0 18px;
  border-radius: 0 0 16px 16px;
}
.sbep-layout-header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.sbep-layout-brand {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}
.sbep-layout-logo-wrap {
  flex-shrink: 0;
}
.sbep-layout-titles {
  min-width: 0;
}
.sbep-layout-kicker {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary, #0f766e);
  opacity: 0.9;
}
.sbep-layout-title {
  margin: 0;
  font-size: clamp(1.25rem, 2.5vw, 1.65rem);
  font-weight: 800;
  color: var(--text-primary, #0f172a);
  line-height: 1.2;
}
.sbep-layout-sub {
  margin: 8px 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.95rem;
  line-height: 1.4;
}
.sbep-layout-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sbep-layout-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 16px 32px;
}
</style>
