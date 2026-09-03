<template>
  <div class="sps">
    <header class="sps-header">
      <div>
        <h2>Settings</h2>
        <p>Your school group email and how you get notified in this portal.</p>
      </div>
    </header>

    <section class="sps-card">
      <h3>Group email subscription</h3>
      <p v-if="groupEmail" class="sps-lead">
        You are changing your subscription to the school group
        <strong>{{ groupEmail }}</strong>.
        This does not remove you from the portal or the group — it only changes how often you receive those messages.
      </p>
      <p v-else class="sps-lead">
        You are changing your subscription to this school’s group email.
        This does not remove you from the portal or the group.
      </p>

      <div v-if="loadingSub" class="sps-muted">Loading your subscription…</div>
      <div v-else-if="subError" class="sps-error">{{ subError }}</div>
      <div v-else-if="!canEditSubscription" class="sps-muted">
        Group email subscription is for school staff on this portal.
      </div>
      <div v-else class="sps-options" role="listbox" aria-label="Group email subscription">
        <button
          v-for="opt in GROUP_SUBSCRIPTION_OPTIONS"
          :key="opt.value"
          type="button"
          class="sps-option"
          :class="{ active: subscription === opt.value }"
          :disabled="savingSub || readOnly"
          role="option"
          :aria-selected="subscription === opt.value"
          @click="changeSubscription(opt.value)"
        >
          <span class="sps-option-label">{{ opt.label }}</span>
          <span class="sps-option-hint">{{ subscriptionHint(opt.value) }}</span>
        </button>
      </div>
      <p v-if="subSuccess" class="sps-success">{{ subSuccess }}</p>
    </section>

    <section class="sps-card sps-card-notifications">
      <h3>Notification settings</h3>
      <p class="sps-lead">
        These control in-app, email, and text alerts from this portal.
        They are separate from the school group email above.
      </p>
      <NotificationTypeSettingsPanel />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import NotificationTypeSettingsPanel from '../../notifications/NotificationTypeSettingsPanel.vue';
import {
  GROUP_SUBSCRIPTION_OPTIONS,
  groupSubscriptionLabel,
  normalizeGroupSubscription
} from '../../../utils/schoolGroupSubscription.js';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  readOnly: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const loadingSub = ref(true);
const savingSub = ref(false);
const subError = ref('');
const subSuccess = ref('');
const groupEmail = ref('');
const subscription = ref('all_mail');
const myStaffId = ref(null);

const canEditSubscription = computed(() => !!myStaffId.value);

function subscriptionHint(value) {
  if (value === 'all_mail') return 'Every message sent to the group';
  if (value === 'digest') return 'A combined email of group messages';
  if (value === 'daily') return 'A shorter daily summary';
  return 'Stay in the group, but do not receive group emails';
}

function parseStaffPayload(data) {
  if (Array.isArray(data)) return { staff: data, schoolGroupEmail: data.find((s) => s.school_group_email)?.school_group_email || '' };
  return {
    staff: Array.isArray(data?.staff) ? data.staff : [],
    schoolGroupEmail: data?.schoolGroupEmail || ''
  };
}

const loadSubscription = async () => {
  if (!props.schoolOrganizationId) return;
  loadingSub.value = true;
  subError.value = '';
  try {
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/school-staff`);
    const parsed = parseStaffPayload(r.data);
    const uid = Number(authStore.user?.id || 0);
    const role = String(authStore.user?.role || '').toLowerCase();
    const me = parsed.staff.find((s) => Number(s.id) === uid) || null;
    myStaffId.value = me?.id || (role === 'school_staff' && uid ? uid : null);
    groupEmail.value = parsed.schoolGroupEmail || me?.school_group_email || '';
    subscription.value = normalizeGroupSubscription(me?.group_email_subscription);
  } catch (e) {
    myStaffId.value = String(authStore.user?.role || '').toLowerCase() === 'school_staff'
      ? Number(authStore.user?.id || 0) || null
      : null;
    subError.value = e.response?.data?.error?.message || 'Could not load your group email subscription.';
  } finally {
    loadingSub.value = false;
  }
};

const changeSubscription = async (nextRaw) => {
  const next = normalizeGroupSubscription(nextRaw);
  if (!myStaffId.value || next === subscription.value || props.readOnly) return;
  savingSub.value = true;
  subError.value = '';
  subSuccess.value = '';
  try {
    const r = await api.patch(
      `/school-portal/${props.schoolOrganizationId}/school-staff/${myStaffId.value}/group-subscription`,
      { subscription: next }
    );
    subscription.value = r.data?.group_email_subscription || next;
    if (r.data?.school_group_email) groupEmail.value = r.data.school_group_email;
    subSuccess.value = `Saved. Your subscription is now ${groupSubscriptionLabel(subscription.value)}.`;
    setTimeout(() => { subSuccess.value = ''; }, 4000);
  } catch (e) {
    subError.value = e.response?.data?.error?.message || 'Could not update your group email subscription.';
  } finally {
    savingSub.value = false;
  }
};

onMounted(loadSubscription);
watch(() => props.schoolOrganizationId, loadSubscription);
</script>

<style scoped>
.sps {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.sps-header h2 {
  margin: 0 0 4px;
  font-size: 1.45rem;
}
.sps-header p,
.sps-lead {
  margin: 0;
  color: #4b5563;
  line-height: 1.5;
}
.sps-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sps-card h3 {
  margin: 0;
  font-size: 1.05rem;
}
.sps-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.sps-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  background: #fff;
  text-align: left;
  cursor: pointer;
  color: #111827;
}
.sps-option + .sps-option {
  border-top: 1px solid #f1f5f9;
}
.sps-option:hover:not(:disabled) {
  background: #f8fafc;
}
.sps-option.active {
  background: #eef2ff;
}
.sps-option:disabled {
  cursor: default;
  opacity: 0.7;
}
.sps-option-label {
  font-weight: 700;
  font-size: 0.95rem;
}
.sps-option-hint {
  font-size: 0.8rem;
  color: #6b7280;
}
.sps-muted { color: #6b7280; }
.sps-error { color: #b91c1c; }
.sps-success { margin: 0; color: #047857; font-weight: 600; }
.sps-card-notifications :deep(.notification-settings) {
  padding: 0;
}
.sps-card-notifications :deep(.settings-heading h2) {
  font-size: 1rem;
}
</style>
