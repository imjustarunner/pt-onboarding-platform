<template>
  <div class="sbep-prov">
    <div class="sbep-prov-toolbar">
      <input v-model="query" class="sbep-prov-search input" type="search" placeholder="Search name, email, about…" />
    </div>
    <div v-if="filtered.length === 0" class="muted small">No providers match your search.</div>
    <div v-else class="sbep-prov-grid">
      <article
        v-for="p in filtered"
        :key="p.id"
        class="sbep-prov-card"
        :class="{ 'sbep-prov-card--expanded': moreOpen[p.id] }"
      >
        <div class="sbep-prov-card-main">
          <div class="sbep-prov-avatar" aria-hidden="true">
            <img v-if="photoUrl(p)" :src="photoUrl(p)" alt="" class="sbep-prov-avatar-img" />
            <span v-else>{{ initialsFor(p) }}</span>
          </div>
          <div class="sbep-prov-meta">
            <div class="sbep-prov-name-row">
              <h3 class="sbep-prov-name">{{ p.firstName }} {{ p.lastName }}</h3>
              <span
                v-if="p.isOnLeave && p.leaveLabel"
                class="sbep-prov-leave"
                :title="p.leaveLabel"
              >
                {{ p.leaveLabel }}
              </span>
            </div>
            <p v-if="p.title" class="sbep-prov-line sbep-prov-strong">{{ p.title }}</p>
            <p v-if="p.credential" class="sbep-prov-line">{{ p.credential }}</p>
            <p v-if="p.serviceFocus" class="sbep-prov-line">{{ p.serviceFocus }}</p>
            <p v-if="p.languagesSpoken" class="sbep-prov-line muted small">Languages: {{ p.languagesSpoken }}</p>
            <p v-if="p.email" class="sbep-prov-line">
              <a :href="`mailto:${p.email}`">{{ p.email }}</a>
            </p>

            <div v-if="hasMoreInfo(p)" class="sbep-prov-more-section">
              <button
                type="button"
                class="btn btn-link btn-sm sbep-prov-more"
                :aria-expanded="Boolean(moreOpen[p.id])"
                @click="toggleMore(p.id)"
              >
                {{ moreOpen[p.id] ? 'Show less' : 'More info' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="moreOpen[p.id] && hasMoreInfo(p)" class="sbep-prov-expanded">
          <div v-if="(p.supervisors || []).length" class="sbep-prov-sup">
            <div class="sbep-prov-sup-label">Supervisors</div>
            <ul class="sbep-prov-sup-list">
              <li v-for="s in p.supervisors" :key="`${p.id}-sup-${s.id}`" class="sbep-prov-sup-li">
                <span class="sbep-prov-sup-avatar" aria-hidden="true">
                  <img v-if="supPhotoUrl(s)" :src="supPhotoUrl(s)" alt="" class="sbep-prov-sup-img" />
                  <span v-else>{{ initialsForSupervisor(s) }}</span>
                </span>
                <span class="sbep-prov-sup-text">
                  <span class="sbep-prov-sup-name">
                    {{ s.firstName }} {{ s.lastName }}
                    <span v-if="s.isPrimary" class="sbep-prov-sup-pill">Primary</span>
                  </span>
                  <span v-if="s.credential" class="sbep-prov-sup-cred">{{ s.credential }}</span>
                  <a v-if="s.email" class="sbep-prov-sup-mail" :href="`mailto:${s.email}`">{{ s.email }}</a>
                </span>
              </li>
            </ul>
          </div>

          <div v-if="p.schoolInfoBlurb" class="sbep-prov-blurb">
            <strong>About</strong>
            <p class="sbep-prov-about-text">{{ p.schoolInfoBlurb }}</p>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  providers: { type: Array, default: () => [] }
});

const query = ref('');
const moreOpen = reactive({});

function hasMoreInfo(p) {
  const sups = (p?.supervisors || []).length > 0;
  const about = String(p?.schoolInfoBlurb || '').trim().length > 0;
  return sups || about;
}

function toggleMore(id) {
  moreOpen[id] = !moreOpen[id];
}

function supPhotoUrl(s) {
  return toUploadsUrl(s?.profilePhotoUrl || null);
}

function initialsForSupervisor(s) {
  const f = String(s?.firstName || '').trim();
  const l = String(s?.lastName || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'S';
}

const normalize = (v) => String(v || '').trim().toLowerCase();

const filtered = computed(() => {
  const list = Array.isArray(props.providers) ? props.providers : [];
  const q = normalize(query.value);
  const sorted = list.slice().sort((a, b) => {
    const la = `${a?.lastName || ''} ${a?.firstName || ''}`.trim();
    const lb = `${b?.lastName || ''} ${b?.firstName || ''}`.trim();
    return la.localeCompare(lb, undefined, { sensitivity: 'base' });
  });
  if (!q) return sorted;
  return sorted.filter((p) => {
    const supHay = (p.supervisors || [])
      .map((s) => `${s.firstName || ''} ${s.lastName || ''} ${s.credential || ''}`)
      .join(' ');
    const hay = `${p?.firstName || ''} ${p?.lastName || ''} ${p?.email || ''} ${p?.title || ''} ${p?.credential || ''} ${p?.schoolInfoBlurb || ''} ${supHay}`;
    return normalize(hay).includes(q);
  });
});

function photoUrl(p) {
  return toUploadsUrl(p?.profilePhotoUrl || null);
}

function initialsFor(p) {
  const f = String(p?.firstName || '').trim();
  const l = String(p?.lastName || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
}
</script>

<style scoped>
.sbep-prov-toolbar {
  margin-bottom: 14px;
}
.sbep-prov-search {
  max-width: 320px;
  width: 100%;
}
.sbep-prov-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  /* Avoid stretching all cards in a row to the tallest — each card keeps its own height */
  align-items: start;
}
.sbep-prov-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  background: #fff;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.sbep-prov-card--expanded {
  /* Full row width: other cards reflow to the next row */
  grid-column: 1 / -1;
}
.sbep-prov-card-main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.sbep-prov-avatar {
  flex: 0 0 auto;
  width: 96px;
  height: 96px;
  border-radius: 18px;
  border: 1px solid var(--border, #e2e8f0);
  background: rgba(15, 118, 110, 0.06);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 800;
  font-size: 1.35rem;
  color: var(--primary, #0f766e);
}
.sbep-prov-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sbep-prov-meta {
  min-width: 0;
  flex: 1;
}
.sbep-prov-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.sbep-prov-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary, #0f172a);
  line-height: 1.2;
}
.sbep-prov-leave {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}
.sbep-prov-line {
  margin: 2px 0;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--text-secondary, #64748b);
}
.sbep-prov-strong {
  color: var(--text-primary, #334155);
  font-weight: 600;
}
.sbep-prov-more-section {
  margin-top: 10px;
}
.sbep-prov-expanded {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
  display: grid;
  grid-template-columns: minmax(220px, 0.95fr) minmax(0, 1.25fr);
  gap: 20px 28px;
  align-items: start;
}
.sbep-prov-expanded:has(.sbep-prov-sup:only-child),
.sbep-prov-expanded:has(.sbep-prov-blurb:only-child) {
  grid-template-columns: minmax(0, 1fr);
}
.sbep-prov-sup {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
  min-width: 0;
}
.sbep-prov-sup + .sbep-prov-blurb {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
@media (max-width: 640px) {
  .sbep-prov-expanded {
    grid-template-columns: 1fr;
  }
  .sbep-prov-sup + .sbep-prov-blurb {
    padding-top: 14px;
    border-top: 1px solid var(--border, #e2e8f0);
  }
}
.sbep-prov-sup-label {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin-bottom: 8px;
}
.sbep-prov-sup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sbep-prov-sup-li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.sbep-prov-sup-avatar {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbep-prov-sup-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sbep-prov-sup-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.35;
}
.sbep-prov-sup-name {
  font-weight: 700;
  color: var(--text-primary, #334155);
}
.sbep-prov-sup-pill {
  margin-left: 6px;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  vertical-align: middle;
}
.sbep-prov-sup-cred {
  color: var(--text-secondary, #64748b);
  font-size: 0.8rem;
}
.sbep-prov-sup-mail {
  color: var(--primary, #0f766e);
  word-break: break-word;
}
.sbep-prov-blurb {
  margin-top: 0;
  min-width: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--text-primary, #334155);
}
.sbep-prov-blurb strong {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbep-prov-about-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.sbep-prov-more {
  margin-top: 0;
  padding-left: 0 !important;
}
@media (max-width: 520px) {
  .sbep-prov-card-main {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .sbep-prov-name-row {
    justify-content: center;
  }
  .sbep-prov-meta {
    width: 100%;
  }
  .sbep-prov-sup-li {
    justify-content: flex-start;
    text-align: left;
  }
}
</style>
