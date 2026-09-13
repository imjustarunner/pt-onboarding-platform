<template>
  <article class="provider-card">
    <!-- Left: Avatar + name -->
    <div class="card-identity">
      <button class="avatar-btn" type="button" @click="$emit('view-profile', provider)">
        <img v-if="provider.profilePhotoUrl && !photoFailed" @error="photoFailed = true" loading="lazy" :src="provider.profilePhotoUrl" :alt="provider.displayName" class="avatar" />
        <div v-else class="avatar avatar-fallback">{{ initials(provider.displayName) }}</div>
      </button>
      <div class="card-name-wrap">
        <h3 class="card-name">
          {{ provider.displayName }}

        </h3>
        <p v-if="titleLabel" class="card-title-label">{{ titleLabel }}</p>
        <p v-if="provider.profile?.publicBlurb" class="card-bio">{{ provider.profile.publicBlurb }}</p>
        <p v-if="provider.acceptingNewClients !== undefined" class="card-accepting">{{ provider.acceptingNewClients ? 'Accepting new clients' : 'Ask the team about availability' }}</p>
        <div class="card-tags">
          <span v-for="tag in visibleTags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <p v-if="provider.ageGroups?.length" class="card-detail">{{ provider.ageGroups.join(' · ') }}</p>
        <p v-if="provider.profile?.insurancesAccepted?.length" class="card-detail">{{ provider.profile.insurancesAccepted.join(' · ') }}</p>
        <div class="card-location-row">
          <span v-if="hasInPerson" class="loc-dot loc-dot--inperson" title="In-Person" />
          <span v-if="hasVirtual" class="loc-dot loc-dot--virtual" title="Virtual" />
          <span v-if="hasBoth" class="loc-dot loc-dot--both" title="In-Person &amp; Virtual" />
          <span class="loc-label">{{ locationLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Center: Next available + weekly slots -->
    <div class="card-slots">
      <p v-if="provider.availability?.nextAvailableAt" class="next-available">
        <span class="next-label">Next available</span>
        <span class="next-time">{{ formatNextAvailable(provider.availability.nextAvailableAt) }}</span>
      </p>
      <p v-else class="next-available next-available--none">No published openings for this search</p>
      <p v-if="hasSlots" class="card-detail">Select a time for a 15-minute hold. No appointment is booked.</p>
      <div class="week-slots">
        <div
          v-for="(daySlots, day) in groupedSlots"
          :key="day"
          class="day-col"
        >
          <span class="day-label">{{ day }}</span>
          <div class="day-times">
            <button
              v-for="slot in daySlots.slice(0, 3)"
              :key="`${slot.startAt}-${slot.endAt}`"
              class="slot-chip"
              :class="slot.programType === 'VIRTUAL' ? 'slot-chip--virtual' : 'slot-chip--inperson'"
              type="button"
              :aria-label="`Hold ${formatNextAvailable(slot.startAt)} for 15 minutes`"
              @click="$emit('book', provider, slot)"
            >
              {{ timeLabel(slot.startAt) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Actions -->
    <div class="card-actions">
      <button class="btn-outline" type="button" @click="$emit('view-profile', provider)">View profile</button>
      <button
        class="btn-book"
        type="button"
        @click="$emit('view-profile', provider)"
      >
        View availability
      </button>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue';
const photoFailed = ref(false);

const props = defineProps({
  provider: { type: Object, required: true },
  isBestMatch: { type: Boolean, default: false },
  isFastest: { type: Boolean, default: false }
});

const emit = defineEmits(['book', 'view-profile']);

const slots = computed(() => props.provider.availability?.slots || []);
const hasSlots = computed(() => slots.value.length > 0);
const hasInPerson = computed(() => slots.value.some((s) => s.programType === 'IN_PERSON'));
const hasVirtual = computed(() => slots.value.some((s) => s.programType === 'VIRTUAL'));
const hasBoth = computed(() => hasInPerson.value && hasVirtual.value);

const locationLabel = computed(() => {
  if (hasBoth.value) return 'In-Person & Virtual';
  if (hasInPerson.value) return 'In-Person';
  if (hasVirtual.value) return 'Virtual';
  return '';
});

const titleLabel = computed(() => {
  return props.provider.title || props.provider.serviceFocus || null;
});

const visibleTags = computed(() => {
  const p = props.provider;
  const tags = [
    ...(p.specialties || []),
    ...(p.modalities || []),
    ...(p.tutoringProfile?.subjectAreas || [])
  ];
  return tags.slice(0, 4);
});

// Group slots by day abbreviation (Mon, Tue, …)
const groupedSlots = computed(() => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const map = {};
  for (const s of slots.value) {
    const d = new Date(s.startAt);
    const key = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }
  return map;
});

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function timeLabel(dt) {
  return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatNextAvailable(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) {
    return `Today at ${timeLabel(dt)}`;
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeLabel(dt)}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ` at ${timeLabel(dt)}`;
}

function bookFirst() {
  if (slots.value.length) {
    emit('book', props.provider, slots.value[0]);
  }
}
</script>

<style scoped>
.provider-card {
  /* Inherits agency CSS vars from :root */
  --pc-p: var(--agency-primary-color, #1e3a5f);
  --pc-a: var(--agency-accent-color, #4338ca);
  --pc-a-tint: color-mix(in srgb, var(--pc-a) 14%, white);
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.875rem;
  padding: 1.25rem;
  transition: box-shadow 0.15s;
}
.provider-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.09); }

/* Identity */
.card-identity {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  min-width: 220px;
  max-width: 220px;
  flex-shrink: 0;
}
.avatar-btn {
  position: relative;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}
.avatar {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-fallback {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--pc-a-tint);
  color: var(--pc-a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}
.badge-overlay {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.6rem;
  font-weight: 700;
  white-space: nowrap;
  padding: 2px 5px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}
.badge-best { background: #16a34a; color: #fff; }
.badge-fastest { background: #ca8a04; color: #fff; }

.card-name-wrap { flex: 1; min-width: 0; }
.card-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.15rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.verified-icon { width: 1rem; height: 1rem; color: #16a34a; flex-shrink: 0; }
.card-title-label { font-size: 0.78rem; color: #6b7280; margin: 0 0 0.4rem; }

.card-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
.tag {
  font-size: 0.7rem;
  background: #f1f5f9;
  color: #475569;
  border-radius: 0.3rem;
  padding: 2px 6px;
}
.card-location-row { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: #6b7280; }
.loc-dot { width: 8px; height: 8px; border-radius: 50%; }
.loc-dot--inperson { background: #16a34a; }
.loc-dot--virtual { background: #2563eb; }
.loc-dot--both { background: linear-gradient(135deg, #16a34a 50%, #2563eb 50%); }

/* Slots */
.card-slots { flex: 1; min-width: 0; }
.next-available {
  font-size: 0.85rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.next-label { font-size: 0.7rem; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
.next-time { color: #16a34a; font-size: 0.9rem; }
.next-available--none .next-time { color: #9ca3af; }
.week-slots { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.day-col { display: flex; flex-direction: column; gap: 0.35rem; }
.day-label { font-size: 0.7rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
.day-times { display: flex; flex-direction: column; gap: 0.3rem; }
.slot-chip {
  font-size: 0.75rem;
  padding: 0.3rem 0.55rem;
  border-radius: 0.4rem;
  border: none;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
  transition: opacity 0.1s;
}
.slot-chip:hover { opacity: 0.8; }
.slot-chip--inperson { background: #dcfce7; color: #166534; }
.slot-chip--virtual { background: #dbeafe; color: #1d4ed8; }

/* Actions */
.card-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex-shrink: 0;
}
.btn-outline {
  padding: 0.5rem 1rem;
  border: 1.5px solid #d1d5db;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  transition: border-color 0.15s;
}
.btn-outline:hover { border-color: var(--pc-a); color: var(--pc-a); }
.btn-book {
  padding: 0.5rem 1rem;
  background: var(--pc-p);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn-book:hover:not(:disabled) { background: #152e4d; }
.btn-book:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 700px) {
  .provider-card { flex-direction: column; }
  .card-identity { max-width: none; }
  .card-actions { flex-direction: row; width: 100%; }
  .btn-outline, .btn-book { flex: 1; }
}

.provider-card{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:24px;padding:26px;border-color:#dfe9e4;box-shadow:0 5px 20px #123f3510}.card-identity{min-width:0;max-width:none;gap:22px}.avatar,.avatar-fallback{width:120px;height:120px}.avatar-fallback{font-size:2rem}.card-name{font-size:1.3rem;line-height:1.3;color:color-mix(in srgb,var(--pc-p) 50%,#123841)}.card-title-label{font-size:.85rem}.card-bio{font-size:.9rem;line-height:1.65;color:#506570;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.card-accepting{color:#176245;font-size:.8rem}.card-detail{font-size:.8rem;color:#506570;line-height:1.6}.tag{border-radius:20px;background:#eff5f2;color:#385951;font-size:.75rem;padding:5px 9px}.card-slots{background:#f3f8f5;border-radius:12px;padding:16px}.card-actions{grid-column:2;flex-direction:row}.card-actions button{white-space:normal;min-height:44px;flex:1}.slot-chip{min-height:40px}.day-label{font-size:.65rem}.day-col{max-width:80px}.provider-card :focus-visible{outline:3px solid var(--pc-p);outline-offset:3px}@media(max-width:1150px){.provider-card{grid-template-columns:1fr}.card-actions{grid-column:1}.card-slots{display:block}}@media(max-width:520px){.provider-card{padding:18px}.card-identity{flex-direction:column}.avatar,.avatar-fallback{width:100px;height:100px}.card-name{font-size:1.25rem}}
</style>
