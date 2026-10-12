<template>
  <div class="lib-grid">
    <article
      v-for="item in items"
      :key="item.id"
      class="lib-card"
      :class="{ 'is-selected': String(selectedId) === String(item.id) }"
      @click="$emit('open', item)"
    >
      <div class="lib-card__top">
        <span class="lib-card__icon" :data-type="typeKey(item)" aria-hidden="true">
          <svg viewBox="0 0 32 40"><path d="M5 1h14l8 8v30H5z" /><path d="M19 1v9h8M10 18h12M10 23h12M10 28h8" /></svg>
          <small>{{ typeShort(item) }}</small>
        </span>
        <span v-if="item.isMine" class="lib-mine-tag">Mine</span>
      </div>
      <h3 class="lib-card__title"><button type="button" @click.stop="$emit('open', item)">{{ item.name }}</button></h3>
      <p v-if="item.description" class="lib-card__desc">{{ item.description }}</p>
      <div class="lib-card__meta">
        <span v-if="item.categoryName" class="lib-pill">{{ item.categoryName }}</span>
        <span class="lib-pill lib-pill--muted">{{ typeLabel(item) }}</span>
      </div>
      <div class="lib-card__foot">
        <span class="lib-card__date">{{ formatDate(item.updatedAt) }}</span>
        <div class="lib-card__actions">
          <button v-if="!isGuide(item)" type="button" class="lib-card__action lib-card__fav" :aria-label="`${item.isFavorite ? 'Remove from' : 'Add to'} favorites: ${item.name}`" :aria-pressed="!!item.isFavorite" @click.stop="$emit('toggle-favorite', item)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg>
          </button>
          <button v-if="showDetails" type="button" class="lib-card__action" :aria-label="`Details for ${item.name}`" @click.stop="$emit('details', item)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>
          </button>
          <button v-if="!isGuide(item) && (canManage || (showOwnerMenu && item.isMine))" type="button" class="lib-card__action" :aria-label="`More actions for ${item.name}`" @click.stop="$emit('menu', item, $event)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
          </button>
        </div>
      </div>
    </article>
  </div>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
  showOwnerMenu: { type: Boolean, default: false },
  selectedId: { type: [Number, String], default: null },
  showDetails: { type: Boolean, default: false }
});
defineEmits(['open', 'toggle-favorite', 'menu', 'details']);
const isGuide = (item) => item.resourceType === 'company_guide';
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
  if (isGuide(item)) return item.guideKey === 'workplace-handbook' ? 'Handbook' : 'Guide';
  if (item.resourceType === 'branded_doc') return 'Document';
  if (item.resourceType === 'google_doc') return 'Google Doc';
  if (item.resourceType === 'link') return 'Link';
  return { pdf: 'PDF', word: 'DOCX', spreadsheet: 'XLSX', presentation: 'PPTX', image: 'Image', text: 'Text' }[item.fileType] || 'File';
}
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<style scoped>
.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 225px), 1fr)); gap: 15px; }
.lib-card { display: flex; flex-direction: column; min-width: 0; gap: 11px; padding: 20px 18px 12px; text-align: left; border: 1px solid #e4e9e4; border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.lib-card:hover { border-color: #b7cbbb; box-shadow: 0 3px 14px #27463109; }
.lib-card.is-selected { border-color: #477057; box-shadow: 0 0 0 1px #477057; background: #fbfdfb; }
.lib-card__top { display: flex; justify-content: space-between; align-items: flex-start; }
.lib-card__icon { position: relative; display: flex; align-items: center; justify-content: center; width: 58px; height: 67px; border-radius: 8px; background: #f2f6ef; color: #597250; }
.lib-card__icon > svg { width: 29px; height: 39px; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; }
.lib-card__icon small { position: absolute; bottom: 9px; left: 25px; font-size: 8px; font-weight: 700; border: 1px solid currentColor; border-radius: 3px; padding: 2px 3px; background: #fff; }
.lib-card__icon[data-type='pdf'] { background: #fff3ec; color: #a66844; }
.lib-card__icon[data-type='google'], .lib-card__icon[data-type='word'] { background: #f0f4fc; color: #587da7; }
.lib-card__icon[data-type='link'], .lib-card__icon[data-type='image'] { background: #f4f0f8; color: #887098; }
.lib-mine-tag { font-size: 10px; padding: 4px 6px; border-radius: 5px; background: #f6f0e1; color: #8d7340; }
.lib-card__title { margin: 0; font-size: 14px; font-weight: 600; color: #22392e; line-height: 1.45; }
.lib-card__title button { display: block; width: 100%; border: 0; padding: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.lib-card__desc { margin: 0; font-size: 12px; line-height: 1.55; color: #788179; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lib-card__meta { display: flex; flex-wrap: wrap; gap: 5px; }
.lib-pill { font-size: 10px; line-height: 1.4; padding: 4px 6px; border-radius: 5px; background: #edf3eb; color: #597053; }
.lib-pill--muted { background: #f1f3f5; color: #6b7580; }
.lib-card__foot { margin-top: auto; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px; padding-top: 12px; }
.lib-card__date { font-size: 10px; color: #859087; }
.lib-card__actions { display: flex; align-items: center; margin-left: auto; }
.lib-card__action { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 34px; width: 34px; height: 34px; border: 0; border-radius: 7px; color: #6d7c72; background: transparent; cursor: pointer; }
.lib-card__action:hover { background: #edf2eb; color: #315c41; }
.lib-card__action svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.lib-card__fav[aria-pressed='true'] { color: #b99547; }
.lib-card__fav[aria-pressed='true'] svg { fill: currentColor; }
button:focus-visible { outline: 2px solid #46765b; outline-offset: 3px; }
@media (max-width: 640px) { .lib-card__action { width: 40px; height: 40px; flex-basis: 40px; } }
</style>
