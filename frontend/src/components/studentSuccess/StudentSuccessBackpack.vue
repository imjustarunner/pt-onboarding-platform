<template>
  <div class="ssb" :class="{ 'ssb--young': ageGroup === 'upper-elementary' }">
    <header class="ssb__head">
      <h3 class="ssb__title">{{ title }}</h3>
      <p class="ssb__sub">Tools and supports you currently carry — and what you could add next.</p>
    </header>

    <div class="ssb__cols">
      <section class="ssb__panel">
        <h4>Currently Packed</h4>
        <ul v-if="packed.length" class="ssb__list">
          <li v-for="item in packed" :key="`p-${item}`">
            <span aria-hidden="true">✓</span> {{ item }}
          </li>
        </ul>
        <p v-else class="ssb__empty">Complete a few domains to pack your backpack.</p>
      </section>
      <section class="ssb__panel ssb__panel--suggest">
        <h4>Could Add</h4>
        <ul v-if="couldAdd.length" class="ssb__list">
          <li v-for="item in couldAdd" :key="`a-${item}`">
            <button
              v-if="interactive"
              type="button"
              class="ssb__add"
              @click="emit('add-tool', item)"
            >
              ○ {{ item }}
            </button>
            <span v-else><span aria-hidden="true">○</span> {{ item }}</span>
          </li>
        </ul>
        <p v-else class="ssb__empty">No suggested tools yet.</p>
      </section>
    </div>

    <div v-if="sections.length" class="ssb__sections">
      <div v-for="sec in sections" :key="sec.label" class="ssb__sec">
        <h4>{{ sec.label }}</h4>
        <div class="ssb__chips">
          <span v-for="t in sec.items" :key="t" class="ssb__chip">{{ t }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  packed: { type: Array, default: () => [] },
  couldAdd: { type: Array, default: () => [] },
  currentStrategies: { type: Array, default: () => [] },
  supportResources: { type: Array, default: () => [] },
  ageGroup: { type: String, default: 'high-school' },
  interactive: { type: Boolean, default: false },
  title: { type: String, default: 'Student Success Backpack' }
});

const emit = defineEmits(['add-tool']);

const sections = computed(() => {
  const out = [];
  if (props.currentStrategies?.length) {
    out.push({ label: 'Strategies', items: props.currentStrategies });
  }
  if (props.supportResources?.length) {
    out.push({ label: 'Support', items: props.supportResources });
  }
  return out;
});
</script>

<style scoped>
.ssb {
  background: linear-gradient(180deg, #fff, #f1f5f9);
  border: 1px solid #dbe3f0;
  border-radius: 16px;
  padding: 1rem 1.1rem 1.15rem;
  color: #0f172a;
}

.ssb--young {
  border-radius: 22px;
  background: linear-gradient(180deg, #fff, #ecfdf5);
}

.ssb__head {
  margin-bottom: 0.85rem;
}

.ssb__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.ssb__sub {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}

.ssb__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.ssb__panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
}

.ssb__panel--suggest {
  background: #fffbeb;
  border-color: #fde68a;
}

.ssb__panel h4 {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.ssb__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.ssb__empty {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.ssb__add {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ssb__add:hover {
  color: #0369a1;
}

.ssb__add:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.ssb__sections {
  margin-top: 0.85rem;
  display: grid;
  gap: 0.65rem;
}

.ssb__sec h4 {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.ssb__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.ssb__chip {
  font-size: 0.75rem;
  font-weight: 600;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
}

@media (max-width: 640px) {
  .ssb__cols {
    grid-template-columns: 1fr;
  }
}
</style>
