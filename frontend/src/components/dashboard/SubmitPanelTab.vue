<template>
  <SubmitHubPanel
    :view="view"
    :visible-action-count="visibleRootActionCount"
    @back="$emit('update:view', 'root')"
  >
    <!-- Root: categorized submit actions -->
    <div v-if="view === 'root'" class="submit-hub__root">
      <SubmitHubSection
        v-for="group in visibleRootGroups"
        :key="group.id"
        :group-id="group.id"
      >
        <div class="submit-hub__grid">
          <button
            v-for="action in group.visibleActions"
            :key="action.id"
            type="button"
            class="submit-hub__action"
            @click="onAction(action.event)"
          >
            <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
            <span class="submit-hub__action-title">{{ actionTitle(action) }}</span>
            <span class="submit-hub__action-desc">{{ actionDescription(action) }}</span>
            <span class="submit-hub__action-cta">Open →</span>
          </button>
        </div>
      </SubmitHubSection>
    </div>

    <!-- Time claims sub-menu -->
    <div v-else-if="view === 'time'" class="submit-hub__sub">
      <p class="submit-hub__sub-hint">Choose a time claim type. Payroll will review before it is added to a pay period.</p>
      <div class="submit-hub__grid">
        <button
          v-for="action in visibleTimeActions"
          :key="action.id"
          type="button"
          class="submit-hub__action"
          @click="onAction(action.event)"
        >
          <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
          <span class="submit-hub__action-title">{{ actionTitle(action) }}</span>
          <span class="submit-hub__action-desc">{{ actionDescription(action) }}</span>
          <span class="submit-hub__action-cta">Open →</span>
        </button>
      </div>
    </div>

    <!-- In-school sub-menu -->
    <div v-else-if="view === 'in_school'" class="submit-hub__sub">
      <p class="submit-hub__sub-hint">In-school mileage and Med Cancel submissions.</p>
      <div class="submit-hub__grid">
        <button
          v-for="action in visibleInSchoolActions"
          :key="action.id"
          type="button"
          class="submit-hub__action"
          @click="onAction(action.event)"
        >
          <span class="submit-hub__action-icon" v-html="actionIcon(action.icon)" />
          <span class="submit-hub__action-title">{{ action.title }}</span>
          <span class="submit-hub__action-desc">{{ action.description }}</span>
          <span class="submit-hub__action-cta">Open →</span>
        </button>
      </div>
    </div>

    <!-- Embedded flows -->
    <div v-else-if="view === 'availability'" class="submit-hub__embed">
      <p v-if="!agencyId" class="submit-hub__warn">Select an organization from the brand menu (top left) to continue.</p>
      <AdditionalAvailabilitySubmit v-else :agency-id="Number(agencyId)" />
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
      />
    </div>
  </SubmitHubPanel>
</template>

<script setup>
import { computed } from 'vue';
import SubmitHubPanel from './SubmitHubPanel.vue';
import SubmitHubSection from './SubmitHubSection.vue';
import AdditionalAvailabilitySubmit from '../AdditionalAvailabilitySubmit.vue';
import VirtualWorkingHoursEditor from '../availability/VirtualWorkingHoursEditor.vue';
import CompanyCarTripsView from '../companyCar/CompanyCarTripsView.vue';
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
  flags: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:view', 'action']);

const flags = computed(() => props.flags || {});

const isVisible = (action) => {
  const key = action.visibleKey;
  if (!key) return true;
  return Boolean(flags.value[key]);
};

const visibleRootGroups = computed(() =>
  SUBMIT_ROOT_GROUPS.map((group) => {
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
};

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

const onAction = (event) => {
  if (event === 'open-time') {
    emit('update:view', 'time');
    return;
  }
  if (event === 'open-in-school') {
    emit('update:view', 'in_school');
    return;
  }
  emit('action', event);
};
</script>

<style scoped>
.submit-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
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
</style>
