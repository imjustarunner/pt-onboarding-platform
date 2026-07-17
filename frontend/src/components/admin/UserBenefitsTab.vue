<template>
  <div class="ub-tab">
    <div v-if="!isSelfView" class="ub-header">
      <div>
        <h2>Benefits Management</h2>
        <p class="ub-subtitle">Manage employee benefits, eligibility, and enrollment details.</p>
      </div>
      <div class="ub-header-actions">
        <button
          v-if="canViewPayroll"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="$emit('navigate', 'payroll')"
        >
          View Employee Benefits Summary
        </button>
        <button
          v-if="canEditUser"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="saving"
          @click="saveAll"
        >
          {{ saving ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="ub-error">{{ loadError }}</div>
    <div v-if="saveError" class="ub-error">{{ saveError }}</div>
    <div v-if="saveSuccess" class="ub-success">Benefits saved.</div>

    <!-- Employee summary -->
    <section class="ub-card ub-summary">
      <div class="ub-summary-left">
        <div class="ub-avatar">{{ initials }}</div>
        <div>
          <div class="ub-name">{{ displayName }}</div>
          <div class="ub-meta">{{ user?.title || '—' }}</div>
          <div class="ub-meta muted">{{ user?.department || user?.service_focus || '—' }}</div>
        </div>
      </div>

      <div class="ub-summary-controls">
        <div v-if="isSelfView" class="ub-field">
          <label>Employee Type</label>
          <div class="ub-readonly">{{ employmentTypeLabel }}</div>
          <small class="ub-hint">
            {{ isPartTime
              ? 'Part-time status is non-tiered; tier-based benefits do not apply.'
              : 'Full-time / tiered employees are evaluated against the benefit tier system.' }}
          </small>
        </div>
        <template v-else>
          <div class="ub-field">
            <label>Part-time employee</label>
            <ToggleSwitch
              v-model="isPartTime"
              :disabled="!canEditUser || saving"
              :label="isPartTime ? 'Part Time (non-tiered)' : 'Full Time (tier system)'"
            />
            <small class="ub-hint">
              {{ isPartTime
                ? 'Part-time employees are non-tiered and not eligible for tier-based benefits.'
                : 'Full-time employees are eligible for tier-based benefits.' }}
            </small>
          </div>

          <div class="ub-field">
            <label for="ub-employment-type">Employee Type</label>
            <select
              id="ub-employment-type"
              v-model="draft.employmentType"
              class="ub-select"
              :disabled="!canEditUser || saving"
            >
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contractor">Contractor</option>
              <option value="intern">Intern</option>
              <option value="per_diem">Per Diem</option>
            </select>
          </div>
        </template>

        <div class="ub-field">
          <label>Current Tier Status</label>
          <div class="ub-tier-row">
            <span v-if="isPartTime" class="ub-pill ub-pill--muted">Non-Tiered (Part Time)</span>
            <span v-else-if="tierLabel" class="ub-pill ub-pill--tier">{{ tierLabel }}</span>
            <span v-else class="ub-pill ub-pill--muted">{{ tierLoading ? 'Loading…' : 'No tier data' }}</span>
            <button
              v-if="!isSelfView && canViewPayroll"
              type="button"
              class="ub-link"
              @click="$emit('navigate', 'payroll')"
            >
              View tier history
            </button>
          </div>
          <div v-if="!isPartTime && graceActive" class="ub-grace">
            <span class="ub-pill ub-pill--grace">Grace Period</span>
            <span class="muted">Active for current pay period</span>
          </div>
        </div>
      </div>

      <dl v-if="!isSelfView" class="ub-summary-dl">
        <div><dt>Start Date</dt><dd>{{ fmtDate(user?.start_date || user?.provider_start_date) }}</dd></div>
        <div><dt>Work Phone</dt><dd>{{ user?.work_phone || '—' }}</dd></div>
        <div><dt>Login Email</dt><dd>{{ user?.email || '—' }}</dd></div>
        <div><dt>Personal Email</dt><dd>{{ user?.personal_email || '—' }}</dd></div>
        <div><dt>Schedule Type</dt><dd>{{ scheduleTypeLabel }}</dd></div>
      </dl>
      <dl v-else class="ub-summary-dl">
        <div><dt>Login Email</dt><dd>{{ user?.email || '—' }}</dd></div>
        <div><dt>Schedule Type</dt><dd>{{ scheduleTypeLabel }}</dd></div>
      </dl>
    </section>

    <div class="ub-grid">
      <!-- Eligibility table -->
      <section class="ub-card" :class="{ 'ub-card--disabled': isPartTime }">
        <div class="ub-card-head">
          <h3>Benefit Eligibility &amp; Enrollment</h3>
          <p v-if="isPartTime" class="ub-banner">
            {{ isSelfView
              ? 'Part-time: tier-based benefits are disabled for your account.'
              : 'Part-time: tier-based benefits are disabled. Eligibility overrides cannot make this employee tier-eligible.' }}
          </p>
        </div>

        <div class="ub-table-wrap">
          <table class="ub-table">
            <thead>
              <tr>
                <th>Benefit</th>
                <th>Eligibility Rule</th>
                <th>{{ isSelfView ? 'Eligible' : 'Employee Eligible' }}</th>
                <th>Enrollment / Status</th>
                <th>Employer Contribution</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in benefitRows" :key="row.id">
                <td>
                  <div class="ub-benefit-name">{{ row.name }}</div>
                </td>
                <td class="muted">{{ row.rule }}</td>
                <td>
                  <span v-if="isSelfView" :class="['ub-eligible', row.eligible ? 'ub-eligible--yes' : 'ub-eligible--no']">
                    {{ row.eligible ? 'Yes' : 'No' }}
                  </span>
                  <ToggleSwitch
                    v-else-if="row.id === 'school_mileage'"
                    :model-value="row.eligible"
                    :disabled="!canEditUser || saving || isPartTime"
                    :label="row.eligible ? 'Yes (in contract)' : 'No'"
                    compact
                    @update:model-value="(v) => setSchoolMileageContract(v)"
                  />
                  <ToggleSwitch
                    v-else
                    :model-value="row.eligible"
                    :disabled="!canEditUser || saving || isPartTime"
                    :label="row.eligible ? 'Yes' : 'No'"
                    compact
                    @update:model-value="(v) => setEligibilityOverride(row.id, v)"
                  />
                </td>
                <td>
                  <!-- Health / 401k enrollment -->
                  <template v-if="row.id === 'health_insurance' || row.id === '401k'">
                    <div v-if="isSelfView">
                      <span :class="['ub-status', row.enrolled ? 'ub-status--yes' : 'ub-status--muted']">
                        {{ row.enrolled ? 'Enrolled' : 'Not enrolled' }}
                      </span>
                      <div v-if="row.statusDetail" class="ub-status-detail muted">{{ row.statusDetail }}</div>
                    </div>
                    <div v-else class="ub-enroll-cell">
                      <ToggleSwitch
                        :model-value="row.enrolled"
                        :disabled="!canEditUser || saving || isPartTime || !row.eligible"
                        :label="row.enrolled ? 'Enrolled' : 'Not enrolled'"
                        compact
                        @update:model-value="(v) => setEnrolled(row.id, v)"
                      />
                      <label v-if="row.id === 'health_insurance' && row.enrolled" class="ub-premium-field">
                        <span>Plan premium (monthly)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          class="ub-premium-input"
                          :value="draft.enrollment.health_insurance.premiumMonthly ?? ''"
                          :disabled="!canEditUser || saving"
                          placeholder="0.00"
                          @input="onHealthPremiumInput($event)"
                        />
                      </label>
                    </div>
                  </template>
                  <template v-else>
                    <span :class="['ub-status', row.statusClass]">{{ row.status }}</span>
                    <div v-if="row.statusDetail" class="ub-status-detail muted">{{ row.statusDetail }}</div>
                  </template>
                </td>
                <td class="muted">
                  <div>{{ row.contribution }}</div>
                  <div v-if="row.contributionDetail" class="ub-status-detail">{{ row.contributionDetail }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="ub-footnote">
          <template v-if="isSelfView">
            Eligibility is based on your tier status and role. Contact HR or payroll if something looks incorrect.
          </template>
          <template v-else>
            Eligibility is automatically determined based on tier status and title. Use toggles to override eligibility when necessary.
            Part-time employees are always treated as non-eligible for tier-based benefits.
          </template>
        </p>
      </section>

      <div class="ub-side">
        <!-- Medicaid Cancel -->
        <section class="ub-card" :class="{ 'ub-card--disabled': isPartTime }">
          <h3>Medicaid Cancel Reimbursement</h3>
          <p class="ub-card-sub">
            {{ isSelfView
              ? 'Your Medicaid Cancel reimbursement schedule for this organization.'
              : 'Controls the Medicaid Cancel rate schedule for this employee (contract).' }}
          </p>
          <div v-if="isSelfView" class="ub-field">
            <span>Rate schedule</span>
            <div class="ub-readonly">{{ medcancelScheduleLabel }}</div>
            <small v-if="isPartTime" class="ub-hint">Disabled while part-time (non-tiered).</small>
          </div>
          <label v-else class="ub-field">
            <span>Rate schedule</span>
            <select v-model="draft.medcancelRateSchedule" class="ub-select" :disabled="!canEditUser || saving || isPartTime">
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <small v-if="!isSelfView" class="ub-hint">{{ isPartTime ? 'Cleared / disabled while part-time (non-tiered).' : 'Save Changes to persist.' }}</small>
        </section>

        <!-- Health employer contribution summary -->
        <section v-if="healthContributionSummary.show" class="ub-card">
          <h3>Health employer contribution</h3>
          <p class="ub-card-sub">Based on plan premium and tier (Tier 2 = 25%, Tier 3 = 50%).</p>
          <dl class="ub-contrib-dl">
            <div><dt>Plan premium (monthly)</dt><dd>{{ healthContributionSummary.premiumLabel }}</dd></div>
            <div><dt>Employer share</dt><dd>{{ healthContributionSummary.shareLabel }}</dd></div>
            <div><dt>Per pay period</dt><dd>{{ healthContributionSummary.perPeriodLabel }}</dd></div>
            <div><dt>YTD employer contribution</dt><dd>{{ healthContributionSummary.ytdLabel }}</dd></div>
          </dl>
          <label v-if="!isSelfView && canEditUser" class="ub-field" style="margin-top: 10px;">
            <span>Recorded YTD employer contribution (optional override)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              class="ub-premium-input"
              :value="draft.enrollment.healthEmployerContributionYtd ?? ''"
              :disabled="saving"
              placeholder="Leave blank to use estimate"
              @input="onHealthYtdInput($event)"
            />
          </label>
        </section>

        <!-- Tier overview -->
        <section class="ub-card" :class="{ 'ub-card--disabled': isPartTime }">
          <h3>Tier &amp; Contribution Overview</h3>
          <div class="ub-table-wrap">
            <table class="ub-table ub-table--compact">
              <thead>
                <tr>
                  <th></th>
                  <th>Tier 1</th>
                  <th>Tier 2</th>
                  <th>Tier 3</th>
                  <th :class="{ 'ub-col-active': isPartTime }">Part Time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>School mileage / mile</td>
                  <td>{{ fmtMoney(SCHOOL_MILEAGE_TIER_RATES[1]) }}</td>
                  <td>{{ fmtMoney(SCHOOL_MILEAGE_TIER_RATES[2]) }} <span class="muted">(50% of $0.70)</span></td>
                  <td>{{ fmtMoney(SCHOOL_MILEAGE_TIER_RATES[3]) }} <span class="muted">(100% of $0.70)</span></td>
                  <td :class="{ 'ub-col-active': isPartTime }" class="muted">—</td>
                </tr>
                <tr>
                  <td>Health premium share</td>
                  <td class="muted">—</td>
                  <td>25%</td>
                  <td>50%</td>
                  <td :class="{ 'ub-col-active': isPartTime }" class="muted">—</td>
                </tr>
                <tr>
                  <td>401(k)</td>
                  <td class="muted">Enroll if eligible</td>
                  <td class="muted">Enroll if eligible</td>
                  <td class="muted">Enroll if eligible</td>
                  <td :class="{ 'ub-col-active': isPartTime }" class="muted">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="ub-footnote">
            School mileage is contract-only. Health employer share applies when enrolled at Tier 2+. 401(k) is enroll/not enroll (no employer match).
          </p>
        </section>

        <!-- Notes (admin only) -->
        <section v-if="!isSelfView" class="ub-card">
          <h3>Notes</h3>
          <textarea
            v-model="draft.benefitsNotes"
            class="ub-notes"
            rows="5"
            placeholder="Add internal notes about this employee's benefits…"
            :disabled="!canEditUser || saving"
          />
          <small class="ub-hint">Visible to HR and Admins only.</small>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api.js';
import ToggleSwitch from '../ui/ToggleSwitch.vue';
import {
  SCHOOL_MILEAGE_TIER_RATES,
  parseBenefitsEnrollment,
  emptyEnrollment,
  healthEmployerSharePct,
  healthEmployerPerPayPeriod,
  estimateHealthEmployerYtd,
  schoolMileageRateForTier
} from '../../utils/benefitsEnrollment.js';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  user: { type: Object, default: null },
  canEditUser: { type: Boolean, default: false },
  canViewPayroll: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null },
  isHourlyWorker: { type: Boolean, default: false },
  /** 'admin' = staff profile editor; 'self' = My Account read-only view */
  mode: { type: String, default: 'admin' }
});

const emit = defineEmits(['navigate', 'updated']);

const isSelfView = computed(() => String(props.mode || 'admin') === 'self');

const BENEFIT_DEFS = [
  {
    id: 'health_insurance',
    name: 'Health Insurance',
    rule: 'Tier 2 or Tier 3',
    minTier: 2
  },
  {
    id: 'medcancel',
    name: 'Medicaid Cancel Reimbursement',
    rule: 'Based on title / Medicaid Cancel schedule',
    minTier: 1,
    titleBased: true
  },
  {
    id: '401k',
    name: '401(k)',
    rule: 'Tier 1, Tier 2, Tier 3',
    minTier: 1
  },
  {
    id: 'school_mileage',
    name: 'School Mileage Reimbursement',
    rule: 'In contract (school mileage)',
    minTier: 0,
    contractBased: true
  }
];

const draft = reactive({
  employmentType: 'full_time',
  medcancelRateSchedule: 'none',
  benefitsNotes: '',
  eligibilityOverrides: {},
  enrollment: emptyEnrollment()
});

const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref(false);
const loadError = ref('');
const tierLoading = ref(false);
const tier = ref(null);
const graceActive = ref(false);

const displayName = computed(() => {
  const u = props.user || {};
  const preferred = String(u.preferred_name || u.preferredName || '').trim();
  if (preferred) return preferred;
  return [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ') || 'Employee';
});

const initials = computed(() => {
  const parts = displayName.value.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
});

const isPartTime = computed({
  get: () => String(draft.employmentType || '') === 'part_time',
  set: (v) => {
    draft.employmentType = v ? 'part_time' : 'full_time';
  }
});

const scheduleTypeLabel = computed(() => {
  if (props.isHourlyWorker || props.user?.is_hourly_worker || props.user?.isHourlyWorker) return 'Hourly (Direct / Indirect)';
  return 'Standard';
});

const EMPLOYMENT_TYPE_LABELS = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contractor: 'Contractor',
  intern: 'Intern',
  per_diem: 'Per Diem'
};

const employmentTypeLabel = computed(() => {
  const key = String(draft.employmentType || 'full_time');
  return EMPLOYMENT_TYPE_LABELS[key] || key;
});

const medcancelScheduleLabel = computed(() => {
  const s = String(draft.medcancelRateSchedule || 'none').toLowerCase();
  if (s === 'low') return 'Low';
  if (s === 'high') return 'High';
  return 'None';
});

const tierLevel = computed(() => {
  const t = tier.value;
  if (!t) return 0;
  const n = Number(t.tierLevel ?? t.tier_level ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const tierLabel = computed(() => {
  if (isPartTime.value) return 'Non-Tiered (Part Time)';
  const t = tier.value;
  if (!t) return '';
  const label = String(t.label || '').trim();
  if (label) return label.split('(')[0].trim() || label;
  const n = tierLevel.value;
  return n ? `Tier ${n}` : (String(t.status || '').trim() || '');
});

const parseOverrides = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return {};
};

const hydrateFromUser = () => {
  const u = props.user || {};
  const et = String(u.employment_type || u.employmentType || 'full_time').toLowerCase() || 'full_time';
  draft.employmentType = ['full_time', 'part_time', 'contractor', 'intern', 'per_diem'].includes(et) ? et : 'full_time';
  const sched = String(u.medcancel_rate_schedule || u.medcancelRateSchedule || 'none').toLowerCase();
  draft.medcancelRateSchedule = ['low', 'high', 'none'].includes(sched) ? sched : 'none';
  draft.benefitsNotes = u.benefits_notes ?? u.benefitsNotes ?? '';
  const overrides = parseOverrides(
    u.benefits_eligibility_overrides_json ?? u.benefitsEligibilityOverrides ?? null
  );
  // Migrate legacy mileage override key → school_mileage
  if (Object.prototype.hasOwnProperty.call(overrides, 'mileage') && !Object.prototype.hasOwnProperty.call(overrides, 'school_mileage')) {
    overrides.school_mileage = overrides.mileage;
    delete overrides.mileage;
  }
  delete overrides.wellness_stipend;
  delete overrides.pd_stipend;
  draft.eligibilityOverrides = overrides;
  draft.enrollment = parseBenefitsEnrollment(
    u.benefits_enrollment_json ?? u.benefitsEnrollment ?? null
  );
};

const setEligibilityOverride = (benefitId, eligible) => {
  if (isPartTime.value) return;
  const next = { ...draft.eligibilityOverrides };
  const ruleEligible = ruleEligibleFor(benefitId);
  if (Boolean(eligible) === Boolean(ruleEligible)) {
    delete next[benefitId];
  } else {
    next[benefitId] = Boolean(eligible);
  }
  draft.eligibilityOverrides = next;
};

const setSchoolMileageContract = (inContract) => {
  if (isPartTime.value) return;
  draft.enrollment.school_mileage.inContract = !!inContract;
};

const setEnrolled = (benefitId, enrolled) => {
  if (benefitId !== 'health_insurance' && benefitId !== '401k') return;
  const bucket = draft.enrollment[benefitId];
  if (!bucket) return;
  const next = !!enrolled;
  bucket.enrolled = next;
  if (next && !bucket.enrolledAt) {
    bucket.enrolledAt = new Date().toISOString();
  }
  if (!next) {
    bucket.enrolledAt = null;
    if (benefitId === 'health_insurance') bucket.premiumMonthly = null;
  }
};

const onHealthPremiumInput = (e) => {
  const raw = String(e?.target?.value ?? '').trim();
  if (raw === '') {
    draft.enrollment.health_insurance.premiumMonthly = null;
    return;
  }
  const n = Number(raw);
  draft.enrollment.health_insurance.premiumMonthly = Number.isFinite(n) && n >= 0 ? n : null;
};

const onHealthYtdInput = (e) => {
  const raw = String(e?.target?.value ?? '').trim();
  if (raw === '') {
    draft.enrollment.healthEmployerContributionYtd = null;
    return;
  }
  const n = Number(raw);
  draft.enrollment.healthEmployerContributionYtd = Number.isFinite(n) && n >= 0 ? n : null;
};

const ruleEligibleFor = (benefitId) => {
  const def = BENEFIT_DEFS.find((b) => b.id === benefitId);
  if (!def) return false;
  if (isPartTime.value) return false;
  if (def.id === 'medcancel') {
    return ['low', 'high'].includes(String(draft.medcancelRateSchedule || '').toLowerCase());
  }
  if (def.id === 'school_mileage') {
    return !!draft.enrollment.school_mileage?.inContract;
  }
  const level = tierLevel.value;
  if (!level) return false;
  return level >= Number(def.minTier || 0);
};

const healthContributionSummary = computed(() => {
  const health = draft.enrollment.health_insurance || {};
  const enrolled = !!health.enrolled && !isPartTime.value && ruleEligibleFor('health_insurance');
  const premium = health.premiumMonthly;
  const share = healthEmployerSharePct(tierLevel.value);
  const perPeriod = enrolled ? healthEmployerPerPayPeriod(premium, tierLevel.value) : null;
  const estimated = enrolled
    ? estimateHealthEmployerYtd(premium, tierLevel.value, health.enrolledAt)
    : 0;
  const recorded = draft.enrollment.healthEmployerContributionYtd;
  const ytd = recorded != null && Number.isFinite(Number(recorded)) ? Number(recorded) : estimated;
  return {
    show: enrolled || (!isSelfView.value && ruleEligibleFor('health_insurance')),
    premiumLabel: premium != null ? fmtMoney(premium) : '—',
    shareLabel: share > 0 ? `${Math.round(share * 100)}%` : '—',
    perPeriodLabel: perPeriod != null ? `${fmtMoney(perPeriod)} / pay period` : '—',
    ytdLabel: enrolled ? `${fmtMoney(ytd)}${recorded == null ? ' (est.)' : ''}` : '—'
  };
});

const benefitRows = computed(() => {
  return BENEFIT_DEFS.map((def) => {
    const ruleEligible = ruleEligibleFor(def.id);
    const hasOverride = Object.prototype.hasOwnProperty.call(draft.eligibilityOverrides || {}, def.id);
    const overrideVal = draft.eligibilityOverrides?.[def.id];
    let eligible = isPartTime.value
      ? false
      : (def.contractBased
        ? ruleEligible
        : (hasOverride ? Boolean(overrideVal) : ruleEligible));

    let status = 'Not Eligible';
    let statusClass = 'ub-status--no';
    let statusDetail = '';
    let contribution = '—';
    let contributionDetail = '';
    let enrolled = false;

    if (def.id === 'health_insurance') {
      enrolled = !!draft.enrollment.health_insurance?.enrolled && eligible;
    } else if (def.id === '401k') {
      enrolled = !!draft.enrollment['401k']?.enrolled && eligible;
    }

    if (isPartTime.value) {
      status = 'Non-Tiered';
      statusClass = 'ub-status--muted';
      if (def.id === 'school_mileage') {
        statusDetail = 'School mileage is for contracted tiered employees';
      }
    } else if (eligible) {
      status = 'Eligible';
      statusClass = 'ub-status--yes';
      if (def.id === 'medcancel') {
        statusDetail = `Schedule: ${draft.medcancelRateSchedule}`;
        contribution = draft.medcancelRateSchedule === 'high'
          ? 'High schedule'
          : draft.medcancelRateSchedule === 'low'
            ? 'Low schedule'
            : '—';
      } else if (def.id === 'school_mileage') {
        const rate = schoolMileageRateForTier(tierLevel.value);
        contribution = rate != null ? `${fmtMoney(rate)} / mile` : '—';
        status = 'Active';
        if (tierLevel.value === 1) statusDetail = 'Tier 1: no reimbursement';
        else if (tierLevel.value === 2) statusDetail = '50% of $0.70 / mile';
        else if (tierLevel.value === 3) statusDetail = '100% of $0.70 / mile';
      } else if (def.id === 'health_insurance') {
        if (enrolled) {
          status = 'Enrolled';
          const share = healthEmployerSharePct(tierLevel.value);
          const per = healthEmployerPerPayPeriod(
            draft.enrollment.health_insurance.premiumMonthly,
            tierLevel.value
          );
          contribution = share > 0 ? `${Math.round(share * 100)}% of premium` : '—';
          if (per != null) contributionDetail = `${fmtMoney(per)} / pay period`;
        } else {
          status = 'Not enrolled';
          statusClass = 'ub-status--muted';
          contribution = tierLevel.value >= 2
            ? `${Math.round(healthEmployerSharePct(tierLevel.value) * 100)}% if enrolled`
            : '—';
        }
      } else if (def.id === '401k') {
        contribution = 'No employer match';
        if (enrolled) {
          status = 'Enrolled';
        } else {
          status = 'Not enrolled';
          statusClass = 'ub-status--muted';
        }
      }
    } else {
      status = 'Not Eligible';
      statusClass = 'ub-status--no';
      if (def.id === 'school_mileage') {
        statusDetail = 'Not in contract';
      } else if (!tierLevel.value && !isPartTime.value) {
        statusDetail = 'Below Tier 1 / no posted tier';
      }
    }

    return {
      id: def.id,
      name: def.name,
      rule: def.rule,
      eligible,
      enrolled,
      status,
      statusClass,
      statusDetail,
      contribution,
      contributionDetail
    };
  });
});

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const fmtMoney = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `$${num.toFixed(2)}`;
};

const loadTier = async () => {
  const agencyId = Number(props.agencyId || 0);
  const userId = Number(props.userId || 0);
  if (!agencyId || !userId) {
    tier.value = null;
    graceActive.value = false;
    return;
  }
  if (!isSelfView.value && !props.canViewPayroll) {
    tier.value = null;
    graceActive.value = false;
    return;
  }
  tierLoading.value = true;
  try {
    const url = isSelfView.value
      ? '/payroll/me/current-tier'
      : `/payroll/users/${userId}/current-tier`;
    const { data } = await api.get(url, {
      params: { agencyId },
      skipGlobalLoading: true
    });
    tier.value = data?.tier || null;
    graceActive.value = !!data?.graceActive;
  } catch {
    tier.value = null;
    graceActive.value = false;
  } finally {
    tierLoading.value = false;
  }
};

const saveAll = async () => {
  if (!props.canEditUser) return;
  saving.value = true;
  saveError.value = '';
  saveSuccess.value = false;
  try {
    if (isPartTime.value) {
      draft.medcancelRateSchedule = 'none';
      draft.enrollment.school_mileage.inContract = false;
      draft.enrollment.health_insurance.enrolled = false;
      draft.enrollment['401k'].enrolled = false;
    }
    const enrollmentPayload = {
      health_insurance: {
        enrolled: !!draft.enrollment.health_insurance.enrolled,
        premiumMonthly: draft.enrollment.health_insurance.premiumMonthly,
        enrolledAt: draft.enrollment.health_insurance.enrolledAt
      },
      '401k': {
        enrolled: !!draft.enrollment['401k'].enrolled,
        enrolledAt: draft.enrollment['401k'].enrolledAt
      },
      school_mileage: {
        inContract: !!draft.enrollment.school_mileage.inContract
      },
      healthEmployerContributionYtd: draft.enrollment.healthEmployerContributionYtd
    };
    const payload = {
      employmentType: draft.employmentType || 'full_time',
      benefitsNotes: draft.benefitsNotes || null,
      benefitsEligibilityOverrides: draft.eligibilityOverrides || {},
      benefitsEnrollment: enrollmentPayload,
      medcancelRateSchedule: isPartTime.value ? 'none' : (draft.medcancelRateSchedule || 'none')
    };
    await api.put(`/users/${props.userId}`, payload);
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2500);
    emit('updated', payload);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Failed to save benefits';
  } finally {
    saving.value = false;
  }
};

watch(
  () => [
    props.userId,
    props.user?.employment_type,
    props.user?.employmentType,
    props.user?.benefits_notes,
    props.user?.benefitsNotes,
    props.user?.medcancel_rate_schedule,
    props.user?.medcancelRateSchedule,
    props.user?.benefits_eligibility_overrides_json,
    props.user?.benefitsEligibilityOverrides,
    props.user?.benefits_enrollment_json,
    props.user?.benefitsEnrollment
  ],
  () => hydrateFromUser(),
  { immediate: true }
);

watch(
  () => [props.userId, props.agencyId, props.canViewPayroll, props.mode],
  () => {
    loadTier();
  },
  { immediate: true }
);
</script>

<style scoped>
.ub-tab {
  padding: 4px 0 24px;
}
.ub-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ub-header h2 {
  margin: 0 0 4px;
  font-size: 1.35rem;
}
.ub-subtitle {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.92rem;
}
.ub-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ub-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.ub-success {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.ub-card {
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 14px;
}
.ub-card h3 {
  margin: 0 0 8px;
  font-size: 1.05rem;
}
.ub-card-sub {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}
.ub-enroll-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.ub-premium-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}
.ub-premium-input {
  width: 140px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #111827;
}
.ub-contrib-dl {
  display: grid;
  gap: 8px;
  margin: 0;
}
.ub-contrib-dl > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.9rem;
}
.ub-contrib-dl dt {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}
.ub-contrib-dl dd {
  margin: 0;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.ub-card--disabled {
  opacity: 0.55;
  filter: grayscale(0.25);
}
.ub-card--disabled .ub-table {
  pointer-events: none;
}
.ub-summary {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(240px, 1.4fr) minmax(200px, 1fr);
  gap: 18px;
  align-items: start;
}
.ub-summary-left {
  display: flex;
  gap: 12px;
  align-items: center;
}
.ub-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #1e3a5f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}
.ub-name {
  font-weight: 700;
  font-size: 1.05rem;
}
.ub-meta {
  font-size: 0.9rem;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.ub-summary-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ub-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ub-field > label,
.ub-field > span:first-child {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b);
}
.ub-select,
.ub-notes {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: var(--bg, #fff);
}
.ub-readonly {
  font-weight: 600;
  font-size: 0.95rem;
  color: #111827;
}
.ub-eligible {
  font-weight: 600;
  font-size: 0.85rem;
}
.ub-eligible--yes { color: #15803d; }
.ub-eligible--no { color: #b45309; }
.ub-hint {
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
}
.ub-tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ub-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.ub-pill--tier {
  background: #dcfce7;
  color: #166534;
}
.ub-pill--grace {
  background: #ede9fe;
  color: #5b21b6;
}
.ub-pill--muted {
  background: #f1f5f9;
  color: #475569;
}
.ub-grace {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 0.85rem;
}
.ub-link {
  background: none;
  border: none;
  color: #1d4ed8;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  text-decoration: underline;
  padding: 0;
}
.ub-summary-dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
.ub-summary-dl div {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  font-size: 0.9rem;
}
.ub-summary-dl dt {
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}
.ub-summary-dl dd {
  margin: 0;
}
.ub-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: start;
}
.ub-side {
  min-width: 0;
}
.ub-banner {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.85rem;
  margin: 0 0 10px;
}
.ub-table-wrap {
  overflow-x: auto;
}
.ub-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.ub-table th,
.ub-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  vertical-align: top;
}
.ub-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b);
}
.ub-table--compact th,
.ub-table--compact td {
  padding: 8px 6px;
  font-size: 0.82rem;
}
.ub-benefit-name {
  font-weight: 600;
}
.ub-status {
  font-weight: 600;
  font-size: 0.85rem;
}
.ub-status--yes { color: #15803d; }
.ub-status--no { color: #b45309; }
.ub-status--muted { color: #64748b; }
.ub-status-detail {
  font-size: 0.78rem;
  margin-top: 2px;
}
.ub-col-active {
  background: #f8fafc;
  font-weight: 600;
}
.ub-footnote {
  margin: 12px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
}
.ub-notes {
  resize: vertical;
  min-height: 100px;
}
@media (max-width: 960px) {
  .ub-summary,
  .ub-grid {
    grid-template-columns: 1fr;
  }
}
</style>
