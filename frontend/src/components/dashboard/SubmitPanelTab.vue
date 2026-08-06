<template>
  <SubmitHubPanel
    :view="view"
    :visible-action-count="visibleRootActionCount"
    @back="$emit('update:view', 'root')"
  >
    <!-- Root: categorized submit actions -->
    <div v-if="view === 'root'" class="submit-hub__root">
      <PayCalculatorCard :agency-id="agencyId" :start-expanded="false" />

      <button
        v-if="featuredLogTime"
        type="button"
        class="submit-hub__featured"
        data-tour="submit-log-time-featured"
        @click="onAction(featuredLogTime.event)"
      >
        <span class="submit-hub__featured-icon" v-html="actionIcon(featuredLogTime.icon)" />
        <span class="submit-hub__featured-body">
          <span class="submit-hub__featured-eyebrow">Log Time</span>
          <span class="submit-hub__featured-title">{{ featuredLogTime.title }}</span>
          <span class="submit-hub__featured-desc">{{ featuredLogTime.description }}</span>
        </span>
        <span class="submit-hub__featured-cta">Open Log Time →</span>
      </button>

      <SubmitHubSection
        v-for="group in visibleRootGroups"
        :key="group.id"
        :group-id="group.id"
      >
        <div class="submit-hub__section-split">
          <div class="submit-hub__section-actions">
            <div class="submit-hub__grid submit-hub__grid--compact">
              <button
                v-for="action in group.visibleActions"
                :key="action.id"
                type="button"
                class="submit-hub__action submit-hub__action--compact"
                :class="{ 'submit-hub__action--featured-inline': action.featured }"
                @click="onAction(action.event)"
              >
                <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
                <span class="submit-hub__action-title">{{ actionTitle(action) }}</span>
                <span class="submit-hub__action-desc">{{ actionDescription(action) }}</span>
                <span class="submit-hub__action-cta">Open →</span>
              </button>

              <!-- Per-user extra time categories — shown only in the "time" group -->
              <template v-if="group.id === 'time' && extraTimeCategories.length">
                <button
                  v-for="cat in extraTimeCategories"
                  :key="cat.id"
                  type="button"
                  class="submit-hub__action submit-hub__action--compact submit-hub__action--cat"
                  :data-cat="cat.categoryType"
                  @click="onAction(cat.event, cat.payload)"
                >
                  <span class="submit-hub__action-icon submit-hub__action-icon--cat" v-html="actionIcon(cat.icon)" />
                  <span class="submit-hub__action-title">{{ cat.label }}</span>
                  <span class="submit-hub__action-desc">{{ cat.desc }}</span>
                  <span class="submit-hub__action-cta">Open →</span>
                </button>
              </template>
            </div>
          </div>
          <SubmitSubmissionHistoryColumn
            :group-id="group.id"
            :blocks="historyBlocksForGroup(group.id)"
            :loading="historyLoading"
            :error="historyError"
            @refresh="refreshHistory"
            @view-payroll="$emit('view-payroll')"
          />
        </div>
      </SubmitHubSection>
    </div>

    <!-- Time claims sub-menu -->
    <div v-else-if="view === 'time'" class="submit-hub__sub">
      <div class="submit-hub__sub-split">
        <div>
          <p class="submit-hub__sub-hint">Choose a time claim type. Payroll will review before it is added to a pay period.</p>
          <div class="submit-hub__grid submit-hub__grid--compact">
            <button
              v-for="action in visibleTimeActions"
              :key="action.id"
              type="button"
              class="submit-hub__action submit-hub__action--compact"
              @click="onAction(action.event)"
            >
              <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
              <span class="submit-hub__action-title">{{ actionTitle(action) }}</span>
              <span class="submit-hub__action-desc">{{ actionDescription(action) }}</span>
              <span class="submit-hub__action-cta">Open →</span>
            </button>
          </div>
        </div>
        <SubmitSubmissionHistoryColumn
          group-id="time"
          :blocks="historyBlocksForGroup('time')"
          :loading="historyLoading"
          :error="historyError"
          @refresh="refreshHistory"
          @view-payroll="$emit('view-payroll')"
        />
      </div>
    </div>

    <!-- In-school sub-menu -->
    <div v-else-if="view === 'in_school'" class="submit-hub__sub">
      <div class="submit-hub__sub-split">
        <div>
          <p class="submit-hub__sub-hint">In-school mileage and Med Cancel submissions.</p>
          <div class="submit-hub__grid submit-hub__grid--compact">
            <button
              v-for="action in visibleInSchoolActions"
              :key="action.id"
              type="button"
              class="submit-hub__action submit-hub__action--compact"
              @click="onAction(action.event)"
            >
              <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
              <span class="submit-hub__action-title">{{ action.title }}</span>
              <span class="submit-hub__action-desc">{{ action.description }}</span>
              <span class="submit-hub__action-cta">Open →</span>
            </button>
          </div>
        </div>
        <SubmitSubmissionHistoryColumn
          group-id="in_school"
          :blocks="historyBlocksForGroup('in_school')"
          :loading="historyLoading"
          :error="historyError"
          @refresh="refreshHistory"
          @view-payroll="$emit('view-payroll')"
        />
      </div>
    </div>

    <!-- Embedded flows -->
    <div v-else-if="view === 'availability'" class="submit-hub__embed">
      <p v-if="!agencyId" class="submit-hub__warn">Select an organization from the brand menu (top left) to continue.</p>
      <AdditionalAvailabilitySubmit v-else :agency-id="Number(agencyId)" school-only />
    </div>

    <div v-else-if="view === 'virtual_hours'" class="submit-hub__embed">
      <p v-if="!agencyId" class="submit-hub__warn">Select an organization from the brand menu (top left) to continue.</p>
      <VirtualWorkingHoursEditor v-else :agency-id="Number(agencyId)" />
    </div>

    <div v-else-if="view === 'company_car'" class="submit-hub__embed">
      <p v-if="!agencyId" class="submit-hub__warn">Select an organization from the brand menu (top left) to continue.</p>
      <CompanyCarTripsView
        v-else
        :agency-id="Number(agencyId)"
        :manage-access="companyCarManageAccess"
        :current-user-id="currentUserId"
        @submitted="refreshHistory"
      />
    </div>
  </SubmitHubPanel>
</template>

<script setup>
import { computed, toRef } from 'vue';
import SubmitHubPanel from './SubmitHubPanel.vue';
import SubmitHubSection from './SubmitHubSection.vue';
import SubmitSubmissionHistoryColumn from './SubmitSubmissionHistoryColumn.vue';
import AdditionalAvailabilitySubmit from '../AdditionalAvailabilitySubmit.vue';
import VirtualWorkingHoursEditor from '../availability/VirtualWorkingHoursEditor.vue';
import CompanyCarTripsView from '../companyCar/CompanyCarTripsView.vue';
import PayCalculatorCard from './PayCalculatorCard.vue';
import { useSubmitSubmissionHistory } from '../../composables/useSubmitSubmissionHistory';
import {
  SUBMIT_ROOT_GROUPS,
  SUBMIT_TIME_ACTIONS,
  SUBMIT_IN_SCHOOL_ACTIONS,
} from '../../config/submitDisplayCategories';

const props = defineProps({
  view: { type: String, default: 'root' },
  agencyId: { type: [Number, String], default: null },
  currentUserId: { type: [Number, String], default: null },
  companyCarManageAccess: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  flags: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:view', 'action', 'view-payroll']);

const flags = computed(() => props.flags || {});

const {
  loading: historyLoading,
  error: historyError,
  historyBlocksForGroup,
  refresh: refreshHistory,
} = useSubmitSubmissionHistory({
  agencyId: toRef(props, 'agencyId'),
  userId: toRef(props, 'currentUserId'),
  flags,
  enabled: toRef(props, 'enabled'),
});

const isVisible = (action) => {
  const key = action.visibleKey;
  if (!key) return true;
  return Boolean(flags.value[key]);
};

const featuredLogTime = computed(() => {
  if (!flags.value.hourlyLogTime) return null;
  for (const group of SUBMIT_ROOT_GROUPS) {
    const hit = (group.actions || []).find((a) => a.id === 'log_time' && isVisible(a));
    if (hit) return hit;
  }
  return null;
});

const visibleRootGroups = computed(() =>
  SUBMIT_ROOT_GROUPS.map((group) => {
    // Featured Log Time is shown as the hero button above; keep it in the Time group too for scanability.
    const visibleActions = (group.actions || []).filter(isVisible);
    return { ...group, visibleActions };
  }).filter((g) => g.visibleActions.length > 0)
);

const visibleRootActionCount = computed(() =>
  visibleRootGroups.value.reduce((n, g) => n + g.visibleActions.length, 0)
);

const visibleTimeActions = computed(() => SUBMIT_TIME_ACTIONS.filter(isVisible));

const visibleInSchoolActions = computed(() => SUBMIT_IN_SCHOOL_ACTIONS.filter(isVisible));

const ACTION_ICONS = {
  car: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-2-3-2-3 2-3 2-2.7.6-3.5 1.1C5.7 11.3 5 12.1 5 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  receipt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z"/><path d="M16 8H8"/><path d="M12 16H8"/></svg>',
  calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>',
  card: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  clipboard: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  video: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  school: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>',
  // Per-user category icons
  indirect:         '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>',
  support_activity: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  supervisor:       '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 12 11 14 15 10"/></svg>',
  indirect_plus:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
};

// Category-type metadata for tenant-colored extra cards
const CATEGORY_TYPE_META = {
  indirect:         { event: 'log-time-indirect',      defaultLabel: 'Indirect Service',  desc: 'Submit indirect service hours.' },
  support_activity: { event: 'log-time-support',       defaultLabel: 'Support Activity',  desc: 'Submit support activity (MEETING rate) hours.' },
  supervisor:       { event: 'log-time-supervisor',    defaultLabel: 'Supervisor Notes',  desc: 'Submit supervision note time.' },
  indirect_plus:    { event: 'log-time-indirect-plus', defaultLabel: 'Indirect Plus',     desc: 'Submit specialty indirect hours (Other Rate 1).' },
};

const extraTimeCategories = computed(() => {
  const cats = flags.value.userTimeCategories;
  if (!Array.isArray(cats) || !cats.length) return [];
  return cats
    .map((c) => {
      const meta = CATEGORY_TYPE_META[c.category_type];
      if (!meta) return null;
      return {
        id: `cat_${c.id || c.category_type}`,
        categoryType: c.category_type,
        label: c.label || meta.defaultLabel,
        desc:  meta.desc,
        event: meta.event,
        icon:  c.category_type,
        payload: { label: c.label || meta.defaultLabel },
      };
    })
    .filter(Boolean);
});

const actionIcon = (name) => ACTION_ICONS[name] || ACTION_ICONS.clipboard;

const actionTitle = (action) => {
  if (action.titleKey === 'overtimeTitle' && flags.value.overtimeTitle) {
    return flags.value.overtimeTitle;
  }
  return action.title;
};

const actionDescription = (action) => {
  if (action.descKey === 'overtimeDesc' && flags.value.overtimeDesc) {
    return flags.value.overtimeDesc;
  }
  return action.description;
};

const onAction = (event, payload) => {
  if (event === 'open-time') {
    emit('update:view', 'time');
    return;
  }
  if (event === 'open-in-school') {
    emit('update:view', 'in_school');
    return;
  }
  emit('action', event, payload);
};

defineExpose({ refreshHistory });
</script>

<style scoped>
.submit-hub__featured {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  margin: 0 0 18px;
  padding: 18px 20px;
  text-align: left;
  border: 2px solid #166534;
  border-radius: 14px;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 55%, #bbf7d0 100%);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(22, 101, 52, 0.12);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.submit-hub__featured:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(22, 101, 52, 0.18);
}
.submit-hub__featured-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: #166534;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.submit-hub__featured-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.submit-hub__featured-eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #166534;
}
.submit-hub__featured-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #14532d;
}
.submit-hub__featured-desc {
  font-size: 0.9rem;
  color: #3f6212;
  line-height: 1.4;
}
.submit-hub__featured-cta {
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #14532d;
  white-space: nowrap;
}
@media (max-width: 640px) {
  .submit-hub__featured {
    flex-wrap: wrap;
  }
  .submit-hub__featured-cta {
    width: 100%;
    padding-left: 68px;
  }
}

.submit-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.submit-hub__section-split {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.85fr);
  gap: 14px;
  align-items: start;
}

.submit-hub__section-actions {
  min-width: 0;
}

.submit-hub__grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 10px;
}

@media (max-width: 960px) {
  .submit-hub__section-split {
    grid-template-columns: 1fr;
  }
}

.submit-hub__action--compact {
  padding: 12px;
}

.submit-hub__action--compact .submit-hub__action-icon {
  width: 34px;
  height: 34px;
}

.submit-hub__action--compact .submit-hub__action-title {
  font-size: 14px;
}

.submit-hub__action--compact .submit-hub__action-desc {
  font-size: 12px;
}

.submit-hub__action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  text-align: left;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.submit-hub__action:hover {
  background: #fff;
  border-color: #86efac;
  box-shadow: 0 2px 8px rgba(22, 101, 52, 0.08);
}

.submit-hub__action--featured-inline {
  border-color: #86efac;
  background: #f0fdf4;
}

.submit-hub__action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #166534;
}

.submit-hub__action-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.submit-hub__action-desc {
  font-size: 13px;
  line-height: 1.45;
  color: #6b7280;
  flex: 1;
}

.submit-hub__action-cta {
  font-size: 13px;
  font-weight: 600;
  color: #166534;
}

.submit-hub__sub-hint {
  margin: 0 0 16px;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
}

.submit-hub__sub-split {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.85fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 960px) {
  .submit-hub__sub-split {
    grid-template-columns: 1fr;
  }
}

.submit-hub__warn {
  padding: 14px 16px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  color: #92400e;
  font-size: 14px;
}

.submit-hub__embed {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 18px;
}

/* Per-user additional time category cards */
.submit-hub__action--cat {
  border-color: var(--cat-accent, #7c3aed);
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
}
.submit-hub__action--cat:hover {
  background: linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%);
  border-color: var(--cat-accent, #7c3aed);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
}
.submit-hub__action-icon--cat {
  background: var(--cat-accent, #7c3aed);
  color: #fff;
}
/* Individual color overrides by category type */
.submit-hub__action--cat[data-cat="indirect"] {
  background: linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%);
  border-color: #7c3aed;
}
.submit-hub__action-icon--cat[data-cat="indirect"],
.submit-hub__action--cat[data-cat="indirect"] .submit-hub__action-icon--cat { background: #7c3aed; }

.submit-hub__action--cat[data-cat="support_activity"] {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #0284c7;
}
.submit-hub__action--cat[data-cat="support_activity"] .submit-hub__action-icon--cat { background: #0284c7; }

.submit-hub__action--cat[data-cat="supervisor"] {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: #b45309;
}
.submit-hub__action--cat[data-cat="supervisor"] .submit-hub__action-icon--cat { background: #b45309; }

.submit-hub__action--cat[data-cat="indirect_plus"] {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #059669;
}
.submit-hub__action--cat[data-cat="indirect_plus"] .submit-hub__action-icon--cat { background: #059669; }
</style>
