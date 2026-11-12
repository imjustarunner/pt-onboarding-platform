<template>
  <div class="my-comp ft-payroll">
    <FundThredPayrollBrand />
    <div class="header">
      <h1>My Compensation</h1>
      <p class="subtitle">Your configured compensation for the selected organization (read-only).</p>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted">Loading compensation…</div>

    <div v-else class="card">
      <section v-if="data?.submission?.schedule" class="rate-transition">
        <img src="/assets/fundthred/wordmark.svg" alt="FundThred" width="170" />
        <h3>New compensation · {{ data.submission.startsOn || 'Date awaiting confirmation' }}</h3>
        <p>{{ data.submission.effective ? 'Active compensation schedule. These rates apply from the date shown.' : data.submission.executed ? 'Signed terms. Payroll activation and service dates determine when these rates apply.' : 'Planned terms. Payroll approval and activation are pending.' }}</p>
        <div v-if="!isNluSchedule || data.submission.schedule.clinicalEligible === true" class="rate-pair"><article v-if="data.submission.schedule.clinicalCreditEligible !== false"><h4>Clinical Session Rate</h4><strong>{{ fmtMoney(data.submission.schedule.creditRate) }} / credit</strong><p>Minimum-workload rate: {{ fmtMoney(data.submission.schedule.creditRateProbation) }} / credit, when applicable.</p></article><article><h4>Direct Care Rate</h4><strong>{{ fmtMoney(data.submission.schedule.hcodeRate) }} / direct hour</strong><p>Minimum-workload rate: {{ fmtMoney(data.submission.schedule.hcodeRateProbation) }} / hour, when applicable.</p></article></div>
        <p>Indirect: {{ fmtMoney(data.submission.schedule.indirectRate) }}/hour · Support activities: {{ fmtMoney(data.submission.schedule.supportRate) }}/hour.</p>
        <template v-if="isNluSchedule">
          <p>NLU category {{schedule.category}} · Overall pay level {{schedule.level}}.</p>
          <section v-if="schedule.childcareLevel" class="service-pay" data-testid="my-childcare-rates"><h4>Childcare · Level {{schedule.childcareLevel}}</h4><p>{{data.submission.effective ? 'Current effective hourly bands' : 'Written individual hourly terms; activation is pending'}}. Attendance is divided by active caregivers and rounded up. Childcare has no automatic indirect allowance.</p><table><thead><tr><th>Children per caregiver</th><th>Hourly rate</th><th>Source</th></tr></thead><tbody><tr v-for="row in childcareRows" :key="row.band"><th>{{row.band}} {{row.band===1?'child':'children'}}</th><td>{{serviceMoney(row.rate)}}</td><td>{{row.individual?'Individual override':data.submission.effective&&ownChildcareRates?.ratesByBand?'Approved category / level':'Confirm approved default'}}</td></tr></tbody></table><p v-if="ownChildcareRates?.reviewRequired" role="status">{{ownChildcareRates.reasons?.join(' ')||'The effective childcare rate requires payroll review.'}}</p></section>
          <section v-if="schedule.tutoringLevel" class="service-pay" data-testid="my-tutoring-rates"><h4>Tutoring · Level {{schedule.tutoringLevel}}</h4><p>Virtual: {{serviceMoney(schedule.tutoringVirtualRate ?? schedule.tutoringHourlyRate)}} / hour · In person: {{serviceMoney(schedule.tutoringInPersonRate ?? schedule.tutoringHourlyRate)}} / hour.</p><p>Approved tutoring includes ten indirect minutes per direct hour, prorated. Submit additional actual work through the normal time flow.</p></section>
          <p v-if="schedule.homeworkHelpRate!=null">Homework Help: {{serviceMoney(schedule.homeworkHelpRate)}} / actual approved hour.</p>
        </template>
        <p v-else>{{ data.submission.indirectMinutesPerHour }} minutes of indirect pay are included per Direct Care hour. Submit only work above that allowance. Credits measure compensation, not actual hours.</p>
      </section>
      <section v-for="group in codeGroups" :key="group.id" class="rate-transition"><h3>{{ group.label }} · approved code mappings</h3><div class="code-grid"><article v-for="code in group.codes" :key="code.code"><strong>{{ code.code }}</strong><p>{{ code.quantityLabel }}</p></article></div></section>
      <p>These code mappings reflect Payroll’s saved settings. Refer to the <a :href="handbookUrl">workplace handbook</a> for service eligibility and policy.</p>
      <SupplementalTime :agency-id="agencyId" :context="data?.submission" :codes="data?.codeGuide" />
      <details v-if="!data?.submission?.effective" open>
      <summary>{{ data?.submission?.effective ? `Historical rates · through ${priorEndDate}` : 'Prior / per-code rate sheet' }}</summary>
      <p v-if="data?.submission?.effective">These rates apply only to earlier services. Current services use the active compensation schedule above.</p>

      <div class="row">
        <strong>Compensation method:</strong>
        <span>{{ compensationMethod }}</span>
      </div>

      <div v-if="compensationMethod === 'Multi-rate card (hourly)'" class="grid">
        <div class="field"><div class="label">Direct rate</div><div class="value">{{ fmtMoney(rateCard.direct_rate) }}/hr</div></div>
        <div class="field"><div class="label">Indirect rate</div><div class="value">{{ fmtMoney(rateCard.indirect_rate) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title1 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_1) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title2 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_2) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title3 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_3) }}/hr</div></div>
      </div>

      <div class="sheet-title">Rate sheet</div>
      <div class="muted" style="margin-top: 4px;">Per-code rates only. Category/unit math is managed by payroll admins in the agency’s Service Code Rules.</div>
      <div style="margin-top: 10px;">
        <div v-if="!visibleRateRows.length" class="muted">No rates configured yet.</div>
        <div v-else class="rate-grid">
          <div v-for="r in visibleRateRows" :key="r.serviceCode" class="rate-item">
            <div class="rate-code">{{ r.serviceCode }}</div>
            <div class="rate-value">{{ fmtMoney(r.rateAmount) }}</div>
          </div>
        </div>
      </div>

      <div class="hint">
        If anything looks wrong, payroll admins can update your rates for a specific pay period.
      </div>
      </details>
    </div>

    <div v-if="healthBenefits.show" class="card health-card">
      <div class="sheet-title">Health insurance — employer contribution</div>
      <p class="muted" style="margin-top: 4px;">
        When enrolled at Tier 2 (25%) or Tier 3 (50%), your plan premium drives the employer share each pay period.
      </p>
      <div class="grid" style="margin-top: 12px;">
        <div class="field">
          <div class="label">Enrollment</div>
          <div class="value">{{ healthBenefits.enrolled ? 'Enrolled' : 'Not enrolled' }}</div>
        </div>
        <div class="field">
          <div class="label">Plan premium (monthly)</div>
          <div class="value">{{ healthBenefits.premiumLabel }}</div>
        </div>
        <div class="field">
          <div class="label">Employer share</div>
          <div class="value">{{ healthBenefits.shareLabel }}</div>
        </div>
        <div class="field">
          <div class="label">Per pay period</div>
          <div class="value">{{ healthBenefits.perPeriodLabel }}</div>
        </div>
        <div class="field">
          <div class="label">YTD employer contribution</div>
          <div class="value">{{ healthBenefits.ytdLabel }}</div>
        </div>
      </div>
      <div class="hint">
        Premium and enrollment are managed under My Benefits. Contact HR/payroll if figures look incorrect.
      </div>
    </div>
  </div>
</template>

<script setup>
import FundThredPayrollBrand from '../payroll/FundThredPayrollBrand.vue';
import SupplementalTime from '../payroll/SupplementalTime.vue';
import {childcareMoney as serviceMoney,CHILDCARE_BANDS} from '../../utils/childcarePresentation.js';
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import {
  parseBenefitsEnrollment,
  healthEmployerSharePct,
  healthEmployerPerPayPeriod,
  estimateHealthEmployerYtd
} from '../../utils/benefitsEnrollment.js';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const handbookUrl = computed(() => `/${agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || 'itsco'}/workplace-handbook`);
const loading = ref(false);
const error = ref('');
const data = ref(null),ownChildcareRates=ref(null);
const schedule=computed(()=>data.value?.submission?.schedule||{});
const isNluSchedule=computed(()=>!!schedule.value.nluCompensationPolicyVersion);
const childcareRows=computed(()=>CHILDCARE_BANDS.map(band=>({band,rate:(data.value?.submission?.effective?ownChildcareRates.value?.ratesByBand?.[band]:null)??schedule.value.childcareRatesByBand?.[band]??schedule.value.childcareRate??schedule.value.childcareHourlyRate??null,individual:schedule.value.childcareRatesByBand?.[band]!=null||schedule.value.childcareRate!=null||schedule.value.childcareHourlyRate!=null})));
const codeGroups=computed(()=>[{id:'clinical_session',label:'Clinical Session Rate'},{id:'direct_care',label:'Hourly / H-code Rate'},{id:'indirect',label:'Indirect Rate'},{id:'support_activity',label:'Support Activity Rate'},{id:'flat',label:'Flat add-ons'}].map(g=>({...g,codes:(data.value?.codeGuide||[]).filter(c=>c.group===g.id&&!c.restricted)})).filter(g=>g.codes.length&&(!isNluSchedule.value||schedule.value.clinicalEligible===true||!['clinical_session','direct_care'].includes(g.id))));
const priorEndDate=computed(()=>{const start=data.value?.submission?.startsOn;if(!start)return '';const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);});

const otherRateTitles = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });
const benefitsEnrollment = ref(null);
const currentTierLevel = ref(0);

const rateCard = computed(() => data.value?.rateCard || null);
const perCodeRates = computed(() => data.value?.priorPerCodeRates || data.value?.perCodeRates || []);
const serviceCodeRules = computed(() => data.value?.serviceCodeRules || []);

const hasRateCard = computed(() => {
  const rc = rateCard.value;
  if (!rc) return false;
  const nums = [
    Number(rc.direct_rate || 0),
    Number(rc.indirect_rate || 0),
    Number(rc.other_rate_1 || 0),
    Number(rc.other_rate_2 || 0),
    Number(rc.other_rate_3 || 0)
  ];
  return nums.some((n) => n > 0.0001);
});

const compensationMethod = computed(() => (hasRateCard.value ? 'Multi-rate card (hourly)' : 'Per service-code rates'));

const fmtMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const fullRateRows = computed(() => {
  const codes = new Map();
  for (const r of serviceCodeRules.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    codes.set(code, { serviceCode: code });
  }
  for (const r of perCodeRates.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    if (!codes.has(code)) codes.set(code, { serviceCode: code });
  }
  const out = Array.from(codes.values()).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode));
  const rateByCode = new Map((perCodeRates.value || []).map((r) => [String(r.service_code || '').trim(), r]));
  return out.map((x) => {
    const r = rateByCode.get(x.serviceCode) || null;
    const rule = (serviceCodeRules.value || []).find((rr) => String(rr.service_code || '').trim() === x.serviceCode) || null;
    const visible = rule ? (rule.show_in_rate_sheet === undefined || rule.show_in_rate_sheet === null ? true : !!rule.show_in_rate_sheet) : true;
    return {
      serviceCode: x.serviceCode,
      rateAmount: r ? Number(r.rate_amount) : null,
      visible
    };
  });
});

const visibleRateRows = computed(() => (fullRateRows.value || []).filter((r) => r.rateAmount !== null && r.visible));

const healthBenefits = computed(() => {
  const en = parseBenefitsEnrollment(benefitsEnrollment.value);
  const health = en.health_insurance || {};
  const tier = currentTierLevel.value;
  const enrolled = !!health.enrolled && tier >= 2;
  const share = healthEmployerSharePct(tier);
  const per = enrolled ? healthEmployerPerPayPeriod(health.premiumMonthly, tier) : null;
  const estimated = enrolled
    ? estimateHealthEmployerYtd(health.premiumMonthly, tier, health.enrolledAt)
    : 0;
  const recorded = en.healthEmployerContributionYtd;
  const ytd = recorded != null ? recorded : estimated;
  return {
    show: true,
    enrolled,
    premiumLabel: health.premiumMonthly != null ? fmtMoney(health.premiumMonthly) : '—',
    shareLabel: enrolled && share > 0 ? `${Math.round(share * 100)}%` : '—',
    perPeriodLabel: per != null ? fmtMoney(per) : '—',
    ytdLabel: enrolled
      ? `${fmtMoney(ytd)}${recorded == null ? ' (est.)' : ''}`
      : '—'
  };
});

let loadGeneration=0;
const load = async () => {
  const requestedAgencyId=agencyId.value,userId=authStore.user?.id,current=++loadGeneration;
  data.value=null;ownChildcareRates.value=null;benefitsEnrollment.value=null;currentTierLevel.value=0;
  if (!requestedAgencyId) return;
  try {
    loading.value=true;error.value='';
    const resp=await api.get('/payroll/me/compensation',{params:{agencyId:requestedAgencyId}});
    if(current!==loadGeneration||agencyId.value!==requestedAgencyId||authStore.user?.id!==userId)return;
    data.value=resp.data||null;
    const [titles,me,tier,childcare]=await Promise.allSettled([
      api.get('/payroll/other-rate-titles',{params:{agencyId:requestedAgencyId,userId:userId||null}}),
      api.get('/users/me',{skipGlobalLoading:true}),
      api.get('/payroll/me/current-tier',{params:{agencyId:requestedAgencyId},skipGlobalLoading:true}),
      isNluSchedule.value&&schedule.value.childcareLevel&&userId?api.get(`/childcare/staff/${userId}/rates`,{params:{agencyId:requestedAgencyId},skipGlobalLoading:true}):Promise.resolve(null)
    ]);
    if(current!==loadGeneration||agencyId.value!==requestedAgencyId||authStore.user?.id!==userId)return;
    const tr=titles.status==='fulfilled'?titles.value.data:{};
    otherRateTitles.value={title1:tr?.title1||'Other 1',title2:tr?.title2||'Other 2',title3:tr?.title3||'Other 3'};
    benefitsEnrollment.value=me.status==='fulfilled'?(me.value.data?.benefitsEnrollment??me.value.data?.benefits_enrollment_json??null):null;
    const t=tier.status==='fulfilled'?tier.value.data?.tier:null;
    currentTierLevel.value=Number(t?.tierLevel??t?.tier_level??0)||0;
    ownChildcareRates.value=childcare.status==='fulfilled'?childcare.value?.data||null:null;
  } catch(e) {if(current===loadGeneration)error.value=e.response?.data?.error?.message||e.message||'Failed to load compensation';}
  finally {if(current===loadGeneration)loading.value=false;}
};

watch(agencyId, async () => {
  await load();
});

onMounted(load);
</script>

<style scoped>
.service-pay table{border-collapse:collapse;width:100%;margin:12px 0}.service-pay th,.service-pay td{padding:9px;text-align:left;border-bottom:1px solid #cbdce5}.service-pay{margin:20px 0}.rate-transition { border:1px solid #d5e4e8;border-radius:18px;padding:22px;margin:16px 0;background:#f7fbfa;color:#0d203d; }
.rate-pair,.code-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:14px; }.code-grid article,.rate-pair article { padding:16px;border:1px solid #dce6eb;border-radius:12px;background:white; }.rate-pair strong { font-size:22px; }.rate-transition p { line-height:1.6; }.rate-transition h3,.rate-transition h4 { color:#0d203d; }

.subtitle { margin: 6px 0 0; color: var(--text-secondary); }
.card { margin-top: 10px; background: var(--app-surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.row { margin: 0 0 10px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
.field { border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
.label { font-size: 12px; color: var(--text-secondary); }
.value { font-weight: 600; margin-top: 4px; }
.sheet-title { margin-top: 14px; font-weight: 700; }
.table-wrap { overflow: auto; margin-top: 10px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px; border-bottom: 1px solid var(--border); }
.right { text-align: right; }
.muted { color: var(--text-secondary); }
.hint { margin-top: 10px; font-size: 12px; color: var(--text-secondary); }
.error-box { background: var(--app-surface-muted, #ffecec); border: 1px solid var(--app-line, #ffb5b5); padding: 10px 12px; border-radius: 10px; margin: 10px 0; }
.rate-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
.rate-item { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: var(--app-surface, #fff); }
.rate-code { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rate-value { font-variant-numeric: tabular-nums; text-align: right; }
.health-card { margin-top: 14px; }
@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr 1fr; }
}
</style>
