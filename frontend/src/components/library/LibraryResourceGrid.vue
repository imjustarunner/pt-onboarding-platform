<template>
  <div class="lib-grid">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="lib-card"
      :class="{ 'is-mine': item.isMine || item.scope === 'personal' }"
      @click="$emit('open', item)"
    >
      <div class="lib-card__top">
        <span class="lib-card__icon" :data-type="typeKey(item)">{{ typeIcon(item) }}</span>
        <div class="lib-card__top-right">
          <span v-if="item.isMine || item.scope === 'personal'" class="lib-mine-tag">Mine</span>
          <button
            type="button"
            class="lib-card__fav"
            :aria-pressed="!!item.isFavorite"
            :title="item.isFavorite ? 'Unfavorite' : 'Favorite'"
            @click.stop="$emit('toggle-favorite', item)"
          >
            {{ item.isFavorite ? '★' : '☆' }}
          </button>
        </div>
      </div>
      <h3 class="lib-card__title">{{ item.name }}</h3>
      <p v-if="item.description" class="lib-card__desc">{{ item.description }}</p>
      <div class="lib-card__meta">
        <span v-if="item.categoryName" class="lib-pill">{{ item.categoryName }}</span>
        <span class="lib-pill lib-pill--muted">{{ typeLabel(item) }}</span>
      </div>
      <div class="lib-card__foot">
        <span>{{ formatDate(item.updatedAt) }}</span>
        <button
          v-if="canManage || (showOwnerMenu && item.isMine)"
          type="button"
          class="lib-card__more"
          @click.stop="$emit('menu', item, $event)"
        >
          ⋯
        </button>
      </div>
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

function typeIcon(item) {
  const k = typeKey(item);
  if (k === 'google') return 'G';
  if (k === 'link') return '↗';
  if (k === 'pdf') return 'PDF';
  if (k === 'image') return 'IMG';
  if (k === 'word') return 'W';
  if (k === 'spreadsheet') return 'X';
  if (k === 'presentation') return 'P';
  return 'DOC';
}

function typeLabel(item) {
  if (item.resourceType === 'google_doc') return 'Google';
  if (item.resourceType === 'link') return 'Link';
  return (item.fileType || 'File').toUpperCase();
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}
</script>

<style scoped>
.lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}

.lib-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 0.9rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.lib-card:hover {
  border-color: #86efac;
  box-shadow: 0 6px 18px rgba(22, 101, 52, 0.08);
}

.lib-card.is-mine {
  border-color: #fbbf24;
  background: linear-gradient(180deg, #fffbeb 0%, #fff 40%);
}

.lib-card__top-right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.lib-mine-tag {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
}

.lib-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lib-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  height: 2.25rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #ecfdf5;
  color: #166534;
}

.lib-card__icon[data-type='google'] {
  background: #eff6ff;
  color: #1d4ed8;
}

.lib-card__icon[data-type='link'] {
  background: #fef3c7;
  color: #b45309;
}

.lib-card__fav {
  border: 0;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #d97706;
}

.lib-card__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
  color: #0f172a;
  line-height: 1.3;
}

.lib-card__desc {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lib-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.lib-pill {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
}

.lib-pill--muted {
  background: #f1f5f9;
  color: #475569;
}

.lib-card__foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #94a3b8;
  padding-top: 0.25rem;
}

.lib-card__more {
  border: 0;
  background: #f1f5f9;
  border-radius: 6px;
  width: 1.75rem;
  height: 1.75rem;
  cursor: pointer;
}
</style>
