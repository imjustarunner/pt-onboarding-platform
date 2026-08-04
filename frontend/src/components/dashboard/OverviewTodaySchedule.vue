<template>
  <section class="ov-card" data-tour="dash-overview-schedule">
    <header class="ov-card-head">
      <div class="ov-card-title-row">
        <span class="ov-card-icon ov-card-icon--purple" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
        <h3 class="ov-card-title">My Schedule</h3>
      </div>
      <button type="button" class="ov-link" @click="$emit('navigate', 'my_schedule')">View Full Schedule</button>
    </header>

    <div class="ov-tabs" role="tablist">
      <button type="button" class="ov-tab ov-tab--active" role="tab" aria-selected="true">Today</button>
      <button type="button" class="ov-tab" role="tab" @click="$emit('navigate', 'my_schedule')">Week</button>
      <button type="button" class="ov-tab" role="tab" @click="$emit('navigate', 'my_schedule')">Month</button>
    </div>

    <div v-if="loading" class="ov-empty">Loading schedule…</div>
    <div v-else-if="!items.length" class="ov-empty ov-empty--cta">
      <p class="ov-empty-title">No appointments scheduled for today.</p>
      <p class="ov-empty-invite">Book a session — office or virtual — to get something on the calendar.</p>
      <div class="ov-cta-row">
        <button type="button" class="ov-cta ov-cta--primary" data-tour="dash-overview-book" @click="$emit('book')">
          Book
        </button>
        <button
          v-if="showVirtualBook"
          type="button"
          class="ov-cta ov-cta--virtual"
          data-tour="dash-overview-book-virtual"
          @click="$emit('book-virtual')"
        >
          Book virtual
        </button>
      </div>
    </div>
    <ul v-else class="ov-timeline">
      <li
        v-for="item in items"
        :key="item.id"
        class="ov-timeline-row"
        :class="[
          `is-${item.status}`,
          item.featured ? 'is-featured-visit' : '',
          item.preslot ? 'is-preslot' : ''
        ]"
      >
        <div class="ov-timeline-rail" aria-hidden="true">
          <span class="ov-timeline-dot" />
        </div>
        <div class="ov-timeline-time">{{ item.timeLabel }}</div>
        <div class="ov-timeline-body">
          <div class="ov-timeline-title-row">
            <img
              v-if="itemLogo(item)"
              class="ov-timeline-logo"
              :src="itemLogo(item)"
              :alt="item.schoolName || ''"
            />
            <div class="ov-timeline-copy">
              <div class="ov-timeline-title">{{ item.title }}</div>
              <div v-if="item.subtitle && !item.featured" class="ov-timeline-sub">{{ item.subtitle }}</div>
              <div v-if="item.featured && item.locationAddress" class="ov-timeline-address">
                {{ item.locationAddress }}
              </div>
              <a
                v-if="item.featured && item.mapsUrl"
                class="ov-timeline-maps"
                :href="item.mapsUrl"
                target="_blank"
                rel="noopener noreferrer"
                @click.stop
              >
                Open in Google Maps ↗
              </a>
            </div>
          </div>
        </div>
        <div class="ov-timeline-actions">
          <button
            v-if="canJoinItem(item)"
            type="button"
            class="ov-join-btn"
            @click.stop="$emit('join', item)"
          >
            Join
          </button>
          <span class="ov-status" :class="`ov-status--${item.status}`">{{ statusLabel(item.status) }}</span>
        </div>
      </li>
    </ul>

    <footer class="ov-card-foot">
      <span>{{ items.length }} appointment{{ items.length === 1 ? '' : 's' }} today</span>
      <!-- Footer CTAs only when the timeline has items; empty state already shows Book / Book virtual. -->
      <div v-if="items.length" class="ov-foot-actions">
        <button type="button" class="ov-link" data-tour="dash-overview-book-foot" @click="$emit('book')">Book</button>
        <button
          v-if="showVirtualBook"
          type="button"
          class="ov-link"
          data-tour="dash-overview-book-virtual-foot"
          @click="$emit('book-virtual')"
        >
          Book virtual
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { useBrandingStore } from '../../store/branding';
import { toUploadsUrl } from '../../utils/uploadsUrl';

defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** When true, show Book virtual (calendar telehealth booking) CTA. */
  showVirtualBook: { type: Boolean, default: false }
});
defineEmits(['navigate', 'book', 'book-virtual', 'join']);

const brandingStore = useBrandingStore();

const itemLogo = (item) => {
  const apiLogo = String(item?.schoolLogoUrl || '').trim();
  if (apiLogo) {
    if (apiLogo.startsWith('http://') || apiLogo.startsWith('https://')) return apiLogo;
    return toUploadsUrl(apiLogo);
  }
  const id = Number(item?.logoAgencyId || 0);
  if (!id) return null;
  return brandingStore.getOrganizationOwnIconUrl(id) || null;
};

const canJoinItem = (item) => {
  if (!String(item?.joinUrl || '').trim()) return false;
  return String(item?.status || '').toLowerCase() !== 'completed';
};

const statusLabel = (s) => {
  if (s === 'completed') return 'Completed';
  if (s === 'in_progress') return 'In Progress';
  return 'Upcoming';
};
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ov-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.ov-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ov-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-card-icon--purple { background: #f3e8ff; color: #7e22ce; }
.ov-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.ov-link {
  background: none;
  border: none;
  color: #7c3aed;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.ov-link:hover { text-decoration: underline; }
.ov-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.ov-tab {
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.ov-tab--active {
  background: #7c3aed;
  color: #fff;
}
.ov-empty {
  font-size: 13px;
  color: #6b7280;
  padding: 18px 0;
  text-align: center;
}
.ov-empty--cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 0 8px;
}
.ov-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.ov-empty-invite {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  max-width: 260px;
  line-height: 1.4;
}
.ov-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}
.ov-cta {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.ov-cta--primary {
  background: #7c3aed;
  color: #fff;
}
.ov-cta--primary:hover { background: #6d28d9; }
.ov-cta--virtual {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.ov-cta--virtual:hover { background: #d1fae5; }
.ov-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
}
.ov-timeline-row {
  display: grid;
  grid-template-columns: 12px 88px 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}
.ov-timeline-row:last-child { border-bottom: none; }
.ov-timeline-row.is-in_progress {
  background: #faf5ff;
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 8px;
  border-bottom-color: transparent;
}
.ov-timeline-row.is-featured-visit {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.14), rgba(16, 185, 129, 0.04));
  border: 1px solid rgba(5, 150, 105, 0.28);
  border-radius: 12px;
  margin: 4px 0;
  padding: 12px 10px;
  box-shadow: inset 4px 0 0 #059669;
}
.ov-timeline-row.is-featured-visit .ov-timeline-dot {
  background: #059669;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.22);
}
.ov-timeline-row.is-preslot {
  opacity: 0.82;
}
.ov-timeline-row.is-preslot .ov-timeline-title {
  color: #64748b;
  font-style: italic;
}
.ov-timeline-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.ov-timeline-logo {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #d1fae5;
  flex: 0 0 auto;
}
.ov-timeline-copy {
  min-width: 0;
}
.ov-timeline-address {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
  color: #334155;
  font-weight: 500;
}
.ov-timeline-maps {
  display: inline-flex;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #047857;
  text-decoration: none;
}
.ov-timeline-maps:hover {
  text-decoration: underline;
}
.ov-timeline-rail {
  display: flex;
  justify-content: center;
  padding-top: 5px;
}
.ov-timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c4b5fd;
  box-shadow: 0 0 0 3px #f3e8ff;
}
.is-completed .ov-timeline-dot { background: #22c55e; box-shadow: 0 0 0 3px #dcfce7; }
.is-in_progress .ov-timeline-dot { background: #7c3aed; box-shadow: 0 0 0 3px #ede9fe; }
.ov-timeline-time {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  padding-top: 2px;
}
.ov-timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.ov-timeline-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 1px;
}
.ov-timeline-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.ov-join-btn {
  border: none;
  border-radius: 999px;
  background: #15803d;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 5px 12px;
  cursor: pointer;
}
.ov-join-btn:hover { background: #166534; }
.ov-status {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.ov-status--completed { background: #dcfce7; color: #166534; }
.ov-status--in_progress { background: #ede9fe; color: #6b21a8; }
.ov-status--upcoming { background: #f3f4f6; color: #4b5563; }
.ov-card-foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.ov-foot-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
@media (max-width: 560px) {
  .ov-timeline-row {
    grid-template-columns: 12px 1fr auto;
  }
  .ov-timeline-time {
    grid-column: 2;
    grid-row: 1;
  }
  .ov-timeline-body {
    grid-column: 2;
  }
  .ov-status {
    grid-column: 3;
    grid-row: 1 / span 2;
    align-self: center;
  }
}

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-icon--purple { background: #2e1a47; color: #c4b5fd; }
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-tab {
  background: #2a2f38;
  color: var(--text-secondary, #94a3b8);
}
[data-theme="dark"] .ov-tab--active {
  background: #7c3aed;
  color: #fff;
}
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-empty-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-empty-invite { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-cta--virtual {
  background: #14291e;
  color: #6ee7b7;
  border-color: #166534;
}
[data-theme="dark"] .ov-cta--virtual:hover { background: #1a3324; }
[data-theme="dark"] .ov-timeline-row { border-bottom-color: #2d3240; }
[data-theme="dark"] .ov-timeline-row.is-in_progress {
  background: #1e1a2e;
  border-bottom-color: transparent;
}
[data-theme="dark"] .ov-timeline-row.is-featured-visit {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.18), rgba(15, 23, 42, 0.4));
  border-color: rgba(52, 211, 153, 0.28);
}
[data-theme="dark"] .ov-timeline-logo {
  background: #0f172a;
  border-color: rgba(52, 211, 153, 0.35);
}
[data-theme="dark"] .ov-timeline-address { color: #cbd5e1; }
[data-theme="dark"] .ov-timeline-maps { color: #6ee7b7; }
[data-theme="dark"] .ov-timeline-row.is-preslot .ov-timeline-title { color: #94a3b8; }
[data-theme="dark"] .ov-timeline-time { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-timeline-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-timeline-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-status--upcoming { background: #2a2f38; color: #94a3b8; }
[data-theme="dark"] .ov-status--completed { background: #14291e; color: #86efac; }
[data-theme="dark"] .ov-status--in_progress { background: #251a3e; color: #c4b5fd; }
[data-theme="dark"] .ov-card-foot {
  border-top-color: #2d3240;
  color: var(--text-secondary, #94a3b8);
}
</style>
