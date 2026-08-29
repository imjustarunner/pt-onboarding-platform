<template>
  <div class="lib-list">
    <div class="lib-list__head">
      <span>Name</span>
      <span>Type</span>
      <span>Category</span>
      <span>Last Updated</span>
      <span></span>
    </div>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="lib-list__row"
      :class="{ 'is-mine': item.isMine || item.scope === 'personal' }"
      @click="$emit('open', item)"
    >
      <span class="lib-list__name">
        <button
          type="button"
          class="lib-list__fav"
          :aria-label="item.isFavorite ? 'Unfavorite' : 'Favorite'"
          @click.stop="$emit('toggle-favorite', item)"
        >
          {{ item.isFavorite ? '★' : '☆' }}
        </button>
        <span v-if="item.isMine || item.scope === 'personal'" class="lib-mine-tag">Mine</span>
        <span class="lib-list__type-badge" :data-type="typeKey(item)">{{ typeShort(item) }}</span>
        <span class="lib-list__title-wrap">
          <span class="lib-list__title">{{ item.name }}</span>
          <span v-if="item.resourceType === 'link' || item.resourceType === 'google_doc'" class="lib-list__url">
            {{ displayUrl(item) }}
          </span>
        </span>
      </span>
      <span class="lib-list__cell">{{ typeLabel(item) }}</span>
      <span class="lib-list__cell">
        <span v-if="item.categoryName" class="lib-cat-pill" :data-slug="item.categorySlug">{{ item.categoryName }}</span>
        <span v-else>—</span>
      </span>
      <span class="lib-list__cell lib-list__updated">
        <span>{{ formatDate(item.updatedAt) }}</span>
        <span v-if="item.updatedByName || item.createdByName" class="lib-list__by">
          by {{ item.updatedByName || item.createdByName }}
        </span>
      </span>
      <span class="lib-list__cell">
        <button
          v-if="canManage || (showOwnerMenu && item.isMine)"
          type="button"
          class="lib-list__more"
          aria-label="More actions"
          @click.stop="$emit('menu', item, $event)"
        >
          ⋯
        </button>
      </span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
  showOwnerMenu: { type: Boolean, default: false }
});

defineEmits(['open', 'toggle-favorite', 'menu']);

function typeKey(item) {
  if (item.resourceType === 'google_doc') return 'google';
  if (item.resourceType === 'link') return 'link';
  return item.fileType || 'file';
}

function typeShort(item) {
  const k = typeKey(item);
  if (k === 'google') return 'GDOC';
  if (k === 'link') return 'LINK';
  if (k === 'pdf') return 'PDF';
  if (k === 'word') return 'DOCX';
  if (k === 'spreadsheet') return 'XLSX';
  if (k === 'presentation') return 'PPTX';
  if (k === 'image') return 'IMG';
  return 'FILE';
}

function typeLabel(item) {
  if (item.resourceType === 'google_doc') return 'Google Doc';
  if (item.resourceType === 'link') return 'Link';
  const map = {
    pdf: 'PDF',
    word: 'DOCX',
    spreadsheet: 'XLSX',
    presentation: 'PPTX',
    image: 'Image',
    text: 'Text'
  };
  return map[item.fileType] || (item.fileType || 'File').toUpperCase();
}

function displayUrl(item) {
  const u = String(item.externalUrl || '').trim();
  if (!u) return '';
  try {
    const parsed = new URL(u);
    return parsed.hostname + (parsed.pathname.length > 1 ? parsed.pathname.slice(0, 28) : '');
  } catch {
    return u.slice(0, 40);
  }
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}
</script>

<style scoped>
.lib-list {
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.lib-list__head,
.lib-list__row {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 0.7fr 1fr 1.1fr 0.35fr;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem 0.35rem;
  text-align: left;
}

.lib-list__head {
  font-size: 0.72rem;
  font-weight: 650;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: 1px solid #f1f5f9;
}

.lib-list__row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.lib-list__row.is-mine {
  background: linear-gradient(90deg, #fffbeb 0, #fffbeb 4px, #fffef7 4px, #fff 28px);
  border-left: 3px solid #d97706;
}

.lib-list__row:hover {
  background: #f8fafc;
}

.lib-list__row.is-mine:hover {
  background: #fff7ed;
}

.lib-mine-tag {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.2rem 0.4rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
}

.lib-list__name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.lib-list__fav {
  border: 0;
  background: transparent;
  color: #d97706;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  flex-shrink: 0;
}

.lib-list__type-badge {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  padding: 0.28rem 0.4rem;
  border-radius: 6px;
  background: #ecfdf5;
  color: #166534;
}

.lib-list__type-badge[data-type='google'] {
  background: #eff6ff;
  color: #1d4ed8;
}

.lib-list__type-badge[data-type='link'] {
  background: #f0fdfa;
  color: #0f766e;
}

.lib-list__type-badge[data-type='pdf'] {
  background: #fef2f2;
  color: #b91c1c;
}

.lib-list__title-wrap {
  min-width: 0;
}

.lib-list__title {
  display: block;
  font-weight: 650;
  color: #0f172a;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lib-list__url {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lib-list__cell {
  font-size: 0.85rem;
  color: #64748b;
}

.lib-list__updated {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.8rem;
}

.lib-list__by {
  color: #94a3b8;
  font-size: 0.72rem;
}

.lib-cat-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 650;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
}

.lib-cat-pill[data-slug='templates'] {
  background: #f5f3ff;
  color: #6d28d9;
}

.lib-cat-pill[data-slug='forms_assessments'] {
  background: #fff7ed;
  color: #c2410c;
}

.lib-cat-pill[data-slug='care_documents'] {
  background: #eff6ff;
  color: #1d4ed8;
}

.lib-cat-pill[data-slug='policies_procedures'] {
  background: #eef2ff;
  color: #4338ca;
}

.lib-cat-pill[data-slug='community_external'] {
  background: #f0fdfa;
  color: #0f766e;
}

.lib-list__more {
  border: 0;
  background: #f1f5f9;
  border-radius: 6px;
  width: 1.75rem;
  height: 1.75rem;
  cursor: pointer;
}

@media (max-width: 720px) {
  .lib-list__head {
    display: none;
  }
  .lib-list__row {
    grid-template-columns: 1fr auto;
  }
  .lib-list__cell:nth-child(2),
  .lib-list__cell:nth-child(3),
  .lib-list__cell:nth-child(4) {
    display: none;
  }
}
</style>
