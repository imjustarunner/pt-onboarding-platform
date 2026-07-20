<template>
  <article class="tool-card" :class="{ 'tool-card--muted': muted }">
    <div class="tool-card__header">
      <div class="tool-card__icon" aria-hidden="true">
        <img
          v-if="imageUrl"
          class="tool-card__img"
          :src="imageUrl"
          alt=""
          @error="imageBroken = true"
        />
        <span v-else class="tool-card__glyph">{{ icon }}</span>
      </div>
      <div class="tool-card__heading">
        <div class="tool-card__title-row">
          <h3 class="tool-card__title">{{ title }}</h3>
          <button
            type="button"
            class="tool-card__fav"
            :aria-pressed="favorited ? 'true' : 'false'"
            :title="favorited ? 'Remove favorite' : 'Add favorite'"
            @click="$emit('toggle-favorite')"
          >{{ favorited ? '★' : '☆' }}</button>
        </div>
        <p v-if="littleName" class="tool-card__little">{{ littleName }}</p>
        <div v-if="displayTags.length" class="tool-card__tags">
          <span
            v-for="tag in displayTags"
            :key="tag"
            class="tool-card__tag"
            :class="{
              'tool-card__tag--clinical': tag === 'Clinical',
              'tool-card__tag--soon': tag === 'Coming soon',
              'tool-card__tag--custom': tag === 'Custom'
            }"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <p class="tool-card__desc">{{ description }}</p>

    <div v-if="meta.length" class="tool-card__meta">
      <span v-for="(m, i) in meta" :key="i" class="tool-card__meta-item">{{ m }}</span>
    </div>

    <div class="tool-card__actions">
      <button
        v-if="showOpen"
        type="button"
        class="tc-btn tc-btn--primary"
        :disabled="openDisabled"
        @click="$emit('open')"
      >{{ openLabel }}</button>
      <button
        v-if="showSecondaryOpen"
        type="button"
        class="tc-btn tc-btn--secondary"
        @click="$emit('secondary-open')"
      >{{ secondaryOpenLabel }}</button>
      <button
        v-if="showCopy"
        type="button"
        class="tc-btn tc-btn--secondary"
        @click="$emit('copy-link')"
      >Copy link</button>
      <button
        v-if="showAssign"
        type="button"
        class="tc-btn tc-btn--secondary"
        @click="$emit('assign')"
      >Assign</button>
      <button
        v-if="showEdit"
        type="button"
        class="tc-btn tc-btn--secondary"
        @click="$emit('edit')"
      >Edit</button>
      <button
        v-if="showDuplicate"
        type="button"
        class="tc-btn tc-btn--secondary"
        @click="$emit('duplicate')"
      >Duplicate</button>
      <slot name="actions" />
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  littleName: { type: String, default: '' },
  description: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  meta: { type: Array, default: () => [] },
  icon: { type: String, default: '◇' },
  imageUrl: { type: String, default: '' },
  favorited: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  showOpen: { type: Boolean, default: true },
  showSecondaryOpen: { type: Boolean, default: false },
  showCopy: { type: Boolean, default: true },
  showAssign: { type: Boolean, default: true },
  showEdit: { type: Boolean, default: false },
  showDuplicate: { type: Boolean, default: false },
  openLabel: { type: String, default: 'Open' },
  secondaryOpenLabel: { type: String, default: 'Use in session' },
  openDisabled: { type: Boolean, default: false }
});

defineEmits(['open', 'secondary-open', 'copy-link', 'assign', 'toggle-favorite', 'edit', 'duplicate']);

const imageBroken = ref(false);

watch(
  () => props.imageUrl,
  () => {
    imageBroken.value = false;
  }
);

const displayTags = computed(() => (props.tags || []).filter(Boolean));

const imageUrl = computed(() => {
  if (imageBroken.value) return '';
  const url = String(props.imageUrl || '').trim();
  return url || '';
});
</script>

<style scoped>
.tool-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  isolation: isolate;
  position: relative;
}
.tool-card--muted {
  opacity: 0.9;
  background: #f8fafc;
}
.tool-card__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.tool-card__icon {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(165deg, #f0fdfa, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  z-index: 0;
}
.tool-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tool-card__glyph {
  font-size: 1.15rem;
  color: #0f766e;
  line-height: 1;
}
.tool-card__heading {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-card__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.tool-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #0f172a;
  word-break: break-word;
}
.tool-card__fav {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.15rem;
  color: #0f766e;
  line-height: 1;
  padding: 0 2px;
  flex: 0 0 auto;
}
.tool-card__little {
  margin: 0;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.3;
}
.tool-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.tool-card__tag {
  font-size: 0.68rem;
  font-weight: 750;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  line-height: 1.2;
  white-space: nowrap;
}
.tool-card__tag--clinical {
  background: #ccfbf1;
  color: #0f766e;
}
.tool-card__tag--soon {
  background: #fef3c7;
  color: #92400e;
}
.tool-card__tag--custom {
  background: #e0e7ff;
  color: #3730a3;
}
.tool-card__desc {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.45;
  flex: 1 1 auto;
}
.tool-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 0.78rem;
  color: #64748b;
}
.tool-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0;
}
.tool-card__meta-item + .tool-card__meta-item::before {
  content: '·';
  margin-right: 10px;
  color: #cbd5e1;
}
.tool-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
.tc-btn {
  border-radius: 10px;
  padding: 7px 11px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid transparent;
  line-height: 1.2;
}
.tc-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.tc-btn--primary {
  background: #0f766e;
  color: #fff;
}
.tc-btn--primary:hover:not(:disabled) {
  background: #0d5f59;
}
.tc-btn--secondary {
  background: #fff;
  color: #334155;
  border-color: #cbd5e1;
}
.tc-btn--secondary:hover {
  background: #f8fafc;
}
</style>
