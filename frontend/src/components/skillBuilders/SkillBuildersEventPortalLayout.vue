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
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.92), transparent 42%),
    linear-gradient(135deg, rgba(255, 244, 232, 0.95) 0%, rgba(255, 225, 220, 0.55) 38%, rgba(238, 246, 255, 0.9) 100%);
  border-bottom: 1px solid rgba(244, 114, 65, 0.12);
  margin: 0 0 22px;
  padding: 22px 0 20px;
  border-radius: 0 0 20px 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
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
  margin: 0 0 6px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c2410c;
}
.sbep-layout-title {
  margin: 0;
  font-size: clamp(1.35rem, 2.8vw, 1.85rem);
  font-weight: 800;
  color: #1f2a44;
  line-height: 1.15;
  letter-spacing: -0.02em;
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
