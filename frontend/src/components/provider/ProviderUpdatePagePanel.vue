<template>
  <div class="pu-page">
    <header class="pu-page-head">
      <h1>{{ page.title }}</h1>
      <p>{{ page.description }}</p>
      <div class="pu-page-progress">
        {{ page.sectionsCompleted }} of {{ page.sectionsTotal }} items complete on this page
      </div>
    </header>

    <!-- Standalone page (Admin Update, Handbook, Amendments): one section fills the view -->
    <ProviderUpdateSectionPanel
      v-if="page.alone && soleSection"
      :section="soleSection"
      :mode="mode"
      :token="token"
      :agency-id="agencyId"
      :recipient="recipient"
      @saved="onSaved"
      @close="$emit('close')"
    />

    <!-- Bundled page: several related sections on one interface -->
    <div v-else class="pu-page-stack">
      <article
        v-for="s in page.sections"
        :key="s.key"
        class="pu-page-block"
        :class="{ done: s.completed }"
      >
        <button
          type="button"
          class="pu-page-block-toggle"
          :aria-expanded="expandedKey === s.key"
          @click="toggle(s.key)"
        >
          <span class="check" :class="s.completed ? 'done' : 'todo'">{{ s.completed ? '✓' : '○' }}</span>
          <span class="titles">
            <strong>{{ s.meta?.title || s.key }}</strong>
            <small>{{ s.completed ? 'Complete' : 'Open to review' }}</small>
          </span>
          <span class="chev">{{ expandedKey === s.key ? '▾' : '▸' }}</span>
        </button>
        <div v-if="expandedKey === s.key" class="pu-page-block-body">
          <ProviderUpdateSectionPanel
            :section="s"
            :mode="mode"
            :token="token"
            :agency-id="agencyId"
            :recipient="recipient"
            @saved="onSaved"
            @close="expandedKey = ''"
          />
        </div>
      </article>

      <div class="pu-page-footer">
        <button
          v-if="page.completed"
          type="button"
          class="pu-btn primary"
          @click="$emit('close')"
        >
          Back to overview
        </button>
        <button
          v-else
          type="button"
          class="pu-btn ghost"
          @click="$emit('close')"
        >
          Save progress &amp; return
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import ProviderUpdateSectionPanel from './ProviderUpdateSectionPanel.vue';

const props = defineProps({
  page: { type: Object, required: true },
  mode: { type: String, default: 'token' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  recipient: { type: Object, default: null }
});
const emit = defineEmits(['saved', 'close']);

const soleSection = computed(() => props.page.sections?.[0] || null);
const expandedKey = ref('');

watch(
  () => props.page?.key,
  () => {
    const firstOpen = (props.page.sections || []).find((s) => !s.completed);
    expandedKey.value = firstOpen?.key || props.page.sections?.[0]?.key || '';
  },
  { immediate: true }
);

function toggle(key) {
  expandedKey.value = expandedKey.value === key ? '' : key;
}

function onSaved(bundle) {
  emit('saved', bundle);
  // Advance to next incomplete item on this page
  const list = props.page.sections || [];
  const idx = list.findIndex((s) => s.key === expandedKey.value);
  const next = list.slice(idx + 1).find((s) => !s.completed) || list.find((s) => !s.completed);
  if (next && next.key !== expandedKey.value) expandedKey.value = next.key;
}
</script>

<style scoped>
.pu-page-head h1 { margin: 0 0 0.25rem; letter-spacing: -0.02em; }
.pu-page-head p { margin: 0 0 0.5rem; color: #64748b; }
.pu-page-progress {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #3d6b4f;
  background: rgba(61, 107, 79, 0.1);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  margin-bottom: 1rem;
}
.pu-page-stack { display: grid; gap: 0.65rem; }
.pu-page-block {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  overflow: hidden;
}
.pu-page-block.done { border-color: rgba(61, 107, 79, 0.35); }
.pu-page-block-toggle {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  border: 0;
  background: transparent;
  padding: 0.85rem 1rem;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.titles { display: grid; gap: 0.1rem; }
.titles small { color: #64748b; }
.check {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 700;
}
.check.done { background: #3d6b4f; color: #fff; }
.check.todo { border: 1.5px dashed #94a3b8; color: #94a3b8; }
.chev { color: #94a3b8; }
.pu-page-block-body { padding: 0 1rem 1rem; border-top: 1px solid rgba(15, 23, 42, 0.06); }
.pu-page-footer { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.pu-btn {
  border: 1px solid rgba(61, 107, 79, 0.35);
  background: #fff;
  color: #3d6b4f;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.pu-btn.primary { background: linear-gradient(135deg, #3d6b4f, #2f5540); color: #fff; border-color: transparent; }
.pu-btn.ghost { background: transparent; }
</style>
