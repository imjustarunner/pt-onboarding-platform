<template>
  <div class="cua-alert" :class="`cua-alert--${variant}`" role="alert">
    <div v-if="showHero" class="cua-alert__hero">
      <div class="cua-alert__icon-wrap" aria-hidden="true">
        <slot name="icon">
          <svg v-if="variant === 'warning'" viewBox="0 0 48 48" fill="none" class="cua-alert__icon">
            <rect x="8" y="10" width="32" height="30" rx="4" stroke="currentColor" stroke-width="2.2" />
            <path d="M16 6h16v6H16z" stroke="currentColor" stroke-width="2.2" />
            <path d="M16 24l6 6 10-12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 48 48" fill="none" class="cua-alert__icon">
            <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2.2" />
            <path d="M24 14v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            <circle cx="24" cy="34" r="1.6" fill="currentColor" />
          </svg>
        </slot>
      </div>
      <h3 class="cua-alert__title">{{ title }}</h3>
      <div class="cua-alert__rule" aria-hidden="true" />
      <p v-if="message" class="cua-alert__message">{{ message }}</p>
    </div>

    <div v-if="whyTitle || whyText" class="cua-alert__why">
      <span class="cua-alert__why-icon" aria-hidden="true">!</span>
      <div>
        <strong>{{ whyTitle || 'Why this matters' }}</strong>
        <p>{{ whyText }}</p>
      </div>
    </div>

    <div v-if="actions.length" class="cua-alert__actions-card">
      <div class="cua-alert__actions-head">
        <span class="cua-alert__actions-line" />
        <span>{{ actionsHeading }}</span>
        <span class="cua-alert__actions-line" />
      </div>
      <div class="cua-alert__actions-grid" :class="{ 'cua-alert__actions-grid--solo': actions.length === 1 }">
        <div
          v-for="(action, idx) in actions"
          :key="action.id || idx"
          class="cua-alert__action"
        >
          <div class="cua-alert__action-icon" :class="`cua-alert__action-icon--${action.tone || 'primary'}`" aria-hidden="true">
            <span v-html="action.icon || defaultIcon(action.tone)" />
          </div>
          <strong>{{ action.label }}</strong>
          <p>{{ action.description }}</p>
          <button
            type="button"
            class="cua-alert__btn"
            :class="action.tone === 'secondary' ? 'cua-alert__btn--outline' : 'cua-alert__btn--primary'"
            @click="$emit('action', action.id || action.label)"
          >
            {{ action.button }}
          </button>
          <span
            v-if="idx === 0 && actions.length > 1"
            class="cua-alert__or"
            aria-hidden="true"
          >OR</span>
        </div>
      </div>
      <div v-if="extraActions.length" class="cua-alert__extra">
        <button
          v-for="extra in extraActions"
          :key="extra.id"
          type="button"
          class="cua-alert__link"
          @click="$emit('action', extra.id)"
        >
          {{ extra.label }}
        </button>
      </div>
    </div>

    <p v-if="hint" class="cua-alert__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  whyTitle: { type: String, default: 'Why this matters' },
  whyText: { type: String, default: '' },
  actionsHeading: { type: String, default: 'What would you like to do?' },
  actions: { type: Array, default: () => [] },
  extraActions: { type: Array, default: () => [] },
  hint: { type: String, default: '' },
  variant: { type: String, default: 'warning' },
  showHero: { type: Boolean, default: true },
});

defineEmits(['action']);

function defaultIcon(tone) {
  if (tone === 'secondary') {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14a4 4 0 014-4h1"/><path d="M10 10V6a2 2 0 114 0v1"/><path d="M16 14h2a4 4 0 010 8h-1"/><path d="M14 18v4"/><path d="M10 18v4"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18M12 15v4M10 17h4"/></svg>';
}
</script>

<style scoped>
.cua-alert {
  --alert-accent: var(--cua-primary, #15803d);
  --alert-warn: #dc2626;
  --alert-warn-soft: #fef2f2;
  --alert-warn-border: #fecaca;
  margin-bottom: 16px;
}
.cua-alert__hero {
  text-align: center;
  padding: 8px 12px 4px;
}
.cua-alert__icon-wrap {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: #fff1f2;
  color: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cua-alert__icon {
  width: 38px;
  height: 38px;
}
.cua-alert__title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.45rem;
  color: #1e293b;
  letter-spacing: -0.02em;
}
.cua-alert__rule {
  width: 56px;
  height: 3px;
  margin: 10px auto 12px;
  border-radius: 999px;
  background: #fda4af;
}
.cua-alert__message {
  margin: 0 auto;
  max-width: 560px;
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.55;
}
.cua-alert__why {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 18px 0;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--alert-warn-border);
  background: var(--alert-warn-soft);
  color: #7f1d1d;
}
.cua-alert__why-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #dc2626;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  flex-shrink: 0;
}
.cua-alert__why strong {
  display: block;
  margin-bottom: 4px;
  color: #b91c1c;
}
.cua-alert__why p {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: #7f1d1d;
}
.cua-alert__actions-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  padding: 18px 18px 20px;
}
.cua-alert__actions-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.cua-alert__actions-line {
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}
.cua-alert__actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  position: relative;
}
.cua-alert__actions-grid--solo {
  grid-template-columns: 1fr;
}
.cua-alert__action {
  position: relative;
  text-align: center;
  padding: 8px 16px 4px;
}
.cua-alert__action + .cua-alert__action {
  border-left: 1px solid #e2e8f0;
}
.cua-alert__action-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 10px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cua-alert__action-icon--primary {
  background: color-mix(in srgb, var(--alert-accent) 12%, #fff);
  color: var(--alert-accent);
}
.cua-alert__action-icon--secondary {
  background: #eff6ff;
  color: #2563eb;
}
.cua-alert__action strong {
  display: block;
  margin-bottom: 6px;
  color: #1e293b;
  font-size: 0.95rem;
}
.cua-alert__action p {
  margin: 0 0 14px;
  color: #64748b;
  font-size: 0.82rem;
  line-height: 1.45;
  min-height: 2.8em;
}
.cua-alert__btn {
  width: 100%;
  border-radius: 10px;
  padding: 11px 14px;
  font-weight: 800;
  font-size: 0.86rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.cua-alert__btn--primary {
  background: var(--alert-accent);
  color: #fff;
}
.cua-alert__btn--outline {
  background: #fff;
  color: #2563eb;
  border-color: #93c5fd;
}
.cua-alert__or {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 800;
  color: #94a3b8;
}
.cua-alert__extra {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 16px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e2e8f0;
}
.cua-alert__link {
  background: none;
  border: none;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.cua-alert__hint {
  margin: 12px 0 0;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
}
.cua-alert--info .cua-alert__icon-wrap {
  background: #eff6ff;
  color: #2563eb;
}
.cua-alert--info .cua-alert__rule {
  background: #93c5fd;
}
@media (max-width: 720px) {
  .cua-alert__actions-grid {
    grid-template-columns: 1fr;
  }
  .cua-alert__action + .cua-alert__action {
    border-left: none;
    border-top: 1px solid #e2e8f0;
    margin-top: 12px;
    padding-top: 16px;
  }
  .cua-alert__or {
    left: 50%;
    top: calc(50% - 6px);
  }
}
</style>
