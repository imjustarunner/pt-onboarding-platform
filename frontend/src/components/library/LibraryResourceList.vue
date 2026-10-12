<template>
  <div class="lib-list" role="table" aria-label="Documents">
    <div class="lib-list__head" role="row">
      <span role="columnheader">Name</span>
      <span role="columnheader">Type</span>
      <span role="columnheader">Category</span>
      <span role="columnheader">Updated</span>
      <span role="columnheader" class="lib-list__actions-label">Actions</span>
    </div>
    <div
      v-for="item in items"
      :key="item.id"
      role="row"
      class="lib-list__row"
      :class="{ 'is-mine': item.isMine, 'is-selected': String(selectedId) === String(item.id) }"
      @click="$emit('open', item)"
    >
      <div class="lib-list__name" role="cell">
        <span class="lib-list__type-badge" :data-type="typeKey(item)" aria-hidden="true">{{ typeShort(item) }}</span>
        <button type="button" class="lib-list__open" @click.stop="$emit('open', item)">
          <span class="lib-list__title">{{ item.name }}</span>
          <span v-if="item.description" class="lib-list__subtitle">{{ item.description }}</span>
          <span v-else-if="item.resourceType === 'link' || item.resourceType === 'google_doc'" class="lib-list__subtitle">{{ displayUrl(item) }}</span>
        </button>
        <span v-if="item.isMine" class="lib-mine-tag">Mine</span>
      </div>
      <span role="cell" class="lib-list__cell lib-list__type">{{ typeLabel(item) }}</span>
      <span role="cell" class="lib-list__cell lib-list__category">
        <span v-if="item.categoryName" class="lib-cat-pill" :data-slug="item.categorySlug">{{ item.categoryName }}</span>
        <span v-else>—</span>
      </span>
      <span role="cell" class="lib-list__cell lib-list__updated">
        <span>{{ formatDate(item.updatedAt) }}</span>
        <span v-if="item.updatedByName || item.createdByName" class="lib-list__by">{{ item.updatedByName || item.createdByName }}</span>
      </span>
      <div role="cell" class="lib-list__actions">
        <button v-if="!isGuide(item)" type="button" class="lib-list__action lib-list__fav" :aria-label="`${item.isFavorite ? 'Remove from' : 'Add to'} favorites: ${item.name}`" :aria-pressed="!!item.isFavorite" @click.stop="$emit('toggle-favorite', item)">
          <svg viewBox="0 0 24 24" aria-hidden="true" :fill="item.isFavorite ? 'currentColor' : 'none'"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg>
        </button>
        <button v-if="showDetails" type="button" class="lib-list__action" :aria-label="`Details for ${item.name}`" @click.stop="$emit('details', item)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>
        </button>
        <button v-if="!isGuide(item) && (canManage || (showOwnerMenu && item.isMine))" type="button" class="lib-list__action" :aria-label="`More actions for ${item.name}`" @click.stop="$emit('menu', item, $event)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
  showOwnerMenu: { type: Boolean, default: false },
  selectedId: { type: [String, Number], default: null },
  showDetails: { type: Boolean, default: false }
});
defineEmits(['open', 'toggle-favorite', 'menu', 'details']);
const isGuide = (item) => item.resourceType === 'company_guide';
const isHandbook = (item) => isGuide(item) && item.guideKey === 'workplace-handbook';
function typeKey(item) {
  if (item.fileType === 'video') return 'video';
  if (isGuide(item)) return 'guide';
  if (item.resourceType === 'branded_doc') return 'document';
  if (item.resourceType === 'google_doc') return 'google';
  if (item.resourceType === 'link') return 'link';
  return item.fileType || 'file';
}
function typeShort(item) {
  return { video: 'VIDEO', guide: 'READ', document: 'DOC', google: 'GDOC', link: 'LINK', pdf: 'PDF', word: 'DOCX', spreadsheet: 'XLSX', presentation: 'PPTX', image: 'IMG', text: 'TXT' }[typeKey(item)] || 'FILE';
}
function typeLabel(item) {
  if (item.fileType === 'video') return 'Video link';
  if (isGuide(item)) return isHandbook(item) ? 'Handbook' : 'Guide';
  if (item.resourceType === 'branded_doc') return 'Document';
  if (item.resourceType === 'google_doc') return 'Google Doc';
  if (item.resourceType === 'link') return 'Link';
  return { pdf: 'PDF', word: 'DOCX', spreadsheet: 'XLSX', presentation: 'PPTX', image: 'Image', text: 'Text' }[item.fileType] || 'File';
}
function displayUrl(item) {
  const value = String(item.externalUrl || '').trim();
  try { const url = new URL(value); return url.hostname + (url.pathname.length > 1 ? url.pathname.slice(0, 28) : ''); }
  catch { return value.slice(0, 40); }
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<style scoped>
.lib-list { min-width: 0; background: #fff; }
.lib-list__head, .lib-list__row { display: grid; grid-template-columns: minmax(160px, 2.7fr) minmax(65px, .65fr) minmax(100px, 1fr) minmax(90px, .9fr) 112px; gap: 14px; align-items: center; padding: 13px 16px; text-align: left; }
.lib-list__head { background: #f8f9f8; color: #64716a; font-size: 11px; font-weight: 600; border-bottom: 1px solid #e7ece8; }
.lib-list__row { min-height: 70px; border-bottom: 1px solid #edf0ed; cursor: pointer; color: #506057; transition: background .12s; }
.lib-list__row:last-child { border-bottom: 0; }
.lib-list__row:hover { background: #f8fbf8; }
.lib-list__row.is-selected { background: #eff5ef; box-shadow: inset 3px 0 #38614d; }
.lib-list__name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.lib-list__type-badge { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 37px; height: 42px; border: 1px solid #dce6df; border-radius: 7px; background: #f3f8f3; color: #355d45; font-size: 9px; font-weight: 700; letter-spacing: .02em; }
.lib-list__type-badge[data-type='pdf'] { background: #fff4f1; color: #b14c33; border-color: #f1dbd4; }
.lib-list__type-badge[data-type='google'], .lib-list__type-badge[data-type='word'] { background: #f0f5fd; color: #3b6694; border-color: #dce5f3; }
.lib-list__type-badge[data-type='image'], .lib-list__type-badge[data-type='link'] { background: #f6f2fa; color: #73598b; border-color: #e8dff1; }
.lib-list__open { min-width: 0; flex: 1; padding: 0; border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer; }
.lib-list__title { display: block; color: #1e3029; font-size: 13px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.lib-list__subtitle { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; font-size: 11px; color: #77817b; }
.lib-mine-tag { flex-shrink: 0; font-size: 9px; border-radius: 5px; padding: 3px 5px; background: #f5efdf; color: #8b6b28; }
.lib-list__cell { font-size: 11px; min-width: 0; }
.lib-list__updated { display: flex; flex-direction: column; gap: 3px; line-height: 1.4; }
.lib-list__by { color: #87918a; font-size: 10px; }
.lib-cat-pill { display: inline-block; border-radius: 6px; padding: 4px 7px; background: #edf4ec; color: #4d684b; font-size: 10px; line-height: 1.4; }
.lib-cat-pill[data-slug='templates'] { background: #f3edf8; color: #765b90; }
.lib-cat-pill[data-slug='forms_assessments'] { background: #fcf0e8; color: #9a6546; }
.lib-cat-pill[data-slug='care_documents'] { background: #ecf3fb; color: #557293; }
.lib-cat-pill[data-slug='policies_procedures'] { background: #f1eef8; color: #706087; }
.lib-list__actions { display: flex; justify-content: flex-end; align-items: center; gap: 2px; }
.lib-list__actions-label { text-align: right; }
.lib-list__action { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 35px; width: 35px; height: 35px; border: 0; border-radius: 7px; background: transparent; color: #69786f; cursor: pointer; }
.lib-list__action:hover { color: #204c37; background: #eaf0e9; }
.lib-list__fav[aria-pressed='true'] { color: #b28b34; }
.lib-list__action svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.lib-list__fav[aria-pressed='true'] svg { fill: currentColor; }
button:focus-visible { outline: 2px solid #46765b; outline-offset: 3px; }
@media (max-width: 1000px) { .lib-list__head, .lib-list__row { grid-template-columns: minmax(160px, 2fr) 65px minmax(80px, 1fr) 112px; gap: 10px; } .lib-list__head > :nth-child(3), .lib-list__category { display: none; } }
@media (max-width: 640px) { .lib-list__head { display: none; } .lib-list__row { grid-template-columns: minmax(0, 1fr); gap: 7px; padding: 13px; } .lib-list__type, .lib-list__updated { display: none; } .lib-list__actions { padding-left: 49px; justify-content: flex-start; } .lib-list__action { width: 40px; height: 40px; flex-basis: 40px; } .lib-list__subtitle { font-size: 10px; } }
</style>
