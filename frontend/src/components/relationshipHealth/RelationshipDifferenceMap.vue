<template>
  <div class="rdm">
    <header class="rdm__head">
      <h3 class="rdm__title">{{ title }}</h3>
      <p class="rdm__sub">
        Similarities may reveal shared strengths or concerns. Differences may identify areas where greater
        understanding is needed — not who is right.
      </p>
    </header>

    <ul class="rdm__list">
      <li
        v-for="c in comparisons"
        :key="c.domainKey"
        class="rdm__row"
        :class="{ active: c.domainKey === activeDomainId, priority: priorityKeys.includes(c.domainKey) }"
        :tabindex="interactive ? 0 : -1"
        @click="interactive && emit('domain-select', c.domainKey)"
        @keydown.enter="interactive && emit('domain-select', c.domainKey)"
      >
        <div class="rdm__top">
          <strong>{{ c.label }}</strong>
          <span class="rdm__status">{{ c.differenceStatusLabel }}</span>
        </div>
        <div class="rdm__scores">
          <span class="rdm__a">{{ partnerALabel }}: {{ c.partnerAScore }}</span>
          <span class="rdm__diff">Difference: {{ c.absoluteDifference }}</span>
          <span class="rdm__b">{{ partnerBLabel }}: {{ c.partnerBScore }}</span>
        </div>
        <div class="rdm__track" aria-hidden="true">
          <div class="rdm__marker rdm__marker--a" :style="{ left: pct(c.partnerAScore) }" />
          <div class="rdm__mid" />
          <div class="rdm__marker rdm__marker--b" :style="{ left: pct(c.partnerBScore) }" />
        </div>
        <p v-if="c.conversationPrompts?.[0]" class="rdm__prompt">
          Conversation prompt: {{ c.conversationPrompts[0] }}
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup>
const props = defineProps({
  comparisons: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  priorityKeys: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false },
  partnerALabel: { type: String, default: 'Partner A' },
  partnerBLabel: { type: String, default: 'Partner B' },
  title: { type: String, default: 'Relationship Difference Map' }
});

const emit = defineEmits(['domain-select']);

function pct(score) {
  return `${Math.max(4, Math.min(96, (Number(score) / 10) * 100))}%`;
}
</script>

<style scoped>
.rdm {
  background: #fff;
  border: 1px solid #dbe3f0;
  border-radius: 16px;
  padding: 1rem 1.1rem;
  color: #0f172a;
}

.rdm__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.rdm__sub {
  margin: 0.3rem 0 0.85rem;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.45;
}

.rdm__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.rdm__row {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  background: #f8fafc;
}

.rdm__row.active {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px #bae6fd;
}

.rdm__row.priority {
  background: #ecfeff;
}

.rdm__row:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.rdm__top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.rdm__status {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}

.rdm__scores {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 0.4rem;
}

.rdm__a {
  color: #0284c7;
}
.rdm__b {
  color: #7e22ce;
}
.rdm__diff {
  color: #64748b;
  font-weight: 600;
}

.rdm__track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
}

.rdm__mid {
  position: absolute;
  left: 50%;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: #94a3b8;
  transform: translateX(-50%);
}

.rdm__marker {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
}

.rdm__marker--a {
  background: #0ea5e9;
  border-radius: 999px;
}

.rdm__marker--b {
  background: #a855f7;
  border-radius: 2px;
}

.rdm__prompt {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: #475569;
  font-style: italic;
}
</style>
