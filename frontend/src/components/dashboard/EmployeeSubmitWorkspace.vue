<template>
  <section class="employee-submit" aria-label="Employee Submit page">
    <div class="employee-submit__banner" role="status">
      <strong>Submitting for {{ employeeName }}</strong>
      <span>Requests use {{ employeeName }}’s assigned rates and go to the normal review queues. You are recorded as the submitter.</span>
    </div>
    <button v-if="logTime" class="btn btn-secondary" type="button" @click="logTime = false">← Back to {{ employeeName }}’s Submit</button>
    <HourlyIndirectTimeLog v-if="logTime" :agency-id="agencyId" :force-bucket="forceBucket" :category-label="categoryLabel" @submitted="refresh" />
    <SubmitPanelTab v-else ref="panel" v-model:view="view" :agency-id="agencyId" :current-user-id="employee.id" :flags="flags" @action="onAction" @view-payroll="openEmployeePayroll" />
    <EventTravelReportModal v-if="travel" :agency-id="agencyId" @close="travel = false" @submitted="refresh" />
    <BudgetSubmitExpensesModal v-if="budget" :agency-id="agencyId" :show="budget" @close="budget = false" @submitted="refresh" />
    <CompanyCarMileageModal v-if="companyCar" :agency-id="agencyId" @close="companyCar = false" @submitted="refresh" />
    <MyPayrollTab v-if="modal" :key="modal"
      :open-mileage-on-mount="modal === 'school-mileage' ? 'school_travel' : null"
      :open-reimbursement-on-mount="modal === 'reimbursement'" :open-pto-on-mount="modal === 'pto'"
      :open-company-card-on-mount="modal === 'company-card'" :open-medcancel-on-mount="modal === 'medcancel'"
      :open-time-on-mount="modal.startsWith('time-') ? modal.slice(5) : null"
      @mileage-modal-closed="modal = null" @reimbursement-modal-closed="modal = null" @pto-modal-closed="modal = null"
      @company-card-modal-closed="modal = null" @medcancel-modal-closed="modal = null" @time-modal-closed="modal = null"
      @mileage-submitted="refresh" @reimbursement-submitted="refresh" @pto-submitted="refresh"
      @company-card-submitted="refresh" @medcancel-submitted="refresh" @time-submitted="refresh" />
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, onMounted, provide, ref } from 'vue';
import { useRouter } from 'vue-router';
import { SUBMIT_CONTEXT, createSubmitApi } from '../../composables/useSubmitContext';
import SubmitPanelTab from './SubmitPanelTab.vue';
import HourlyIndirectTimeLog from './HourlyIndirectTimeLog.vue';
import MyPayrollTab from './MyPayrollTab.vue';
import EventTravelReportModal from '../events/EventTravelReportModal.vue';
import BudgetSubmitExpensesModal from '../budget/BudgetSubmitExpensesModal.vue';
import CompanyCarMileageModal from '../companyCar/CompanyCarMileageModal.vue';
const props = defineProps({ agencyId:{type:Number,required:true}, employee:{type:Object,required:true}, agencyFlags:{type:Object,default:()=>({})} });
// Parent keys this component by organization + employee. A request/form never changes owner midway.
const context = { agencyId:props.agencyId, employee:props.employee };
provide(SUBMIT_CONTEXT, context);
const api = createSubmitApi(context), router = useRouter();
const employeeName = computed(()=>`${props.employee.firstName} ${props.employee.lastName}`.trim());
const panel = ref(null), view = ref('root'), logTime = ref(false), travel = ref(false), modal = ref(null);
const budget = ref(false), companyCar = ref(false);
const forceBucket = ref(null), categoryLabel = ref(null), schools = ref([]), categories = ref([]), error = ref('');
const flags = computed(()=>({
  companyCardEnabled:props.employee.companyCardEnabled,
  hourlyLogTime:true,
  companyCar:props.employee.companyCarSubmitAccess || props.employee.companyCarManageAccess,
  budgetExpenses:props.employee.budgetSubmitAccess && !!props.agencyFlags.budgetManagementEnabled,
  inSchoolGroup:props.agencyFlags.inSchoolSubmissionsEnabled !== false && schools.value.length > 0,
  hasSchools:schools.value.length > 0,
  medcancel:props.employee.medcancelEnabled && props.agencyFlags.medcancelEnabled !== false && schools.value.length > 0,
  timeExcess:props.agencyFlags.timeClaimExcessEnabled !== false,
  timeCorrection:props.agencyFlags.timeClaimServiceCorrectionEnabled !== false,
  userTimeCategories:categories.value
}));
const refresh = ()=>panel.value?.refreshHistory();
function onAction(action,payload) {
  error.value = '';
  if (action.startsWith('log-time')) { forceBucket.value = action === 'log-time-indirect-plus' ? 'other_1' : null; categoryLabel.value = payload?.label || null; logTime.value = true; }
  else if (action === 'event-travel' || action === 'mileage') travel.value = true;
  else if (action === 'budget-expenses') budget.value = true;
  else if (action === 'company-car') companyCar.value = true;
  else if (action === 'availability') view.value = 'availability';
  else if (action === 'virtual-hours') view.value = 'virtual_hours';
  else modal.value = action;
}
function openEmployeePayroll() {
  router.push({ path:'/admin/users/'+props.employee.id, query:{ tab:'payroll' } });
}
onMounted(async()=>{
  const results = await Promise.allSettled([
    api.get('/payroll/me/assigned-schools').then(r=>schools.value=r.data || []),
    api.get('/payroll/my-time-categories').then(r=>categories.value=r.data || [])
  ]);
  if(results.some(r=>r.status==='rejected')) error.value='Some employee submission options could not load. Reopen this employee’s Submit page to retry.';
});
</script>
<style scoped>
.employee-submit__banner { display:flex; flex-direction:column; gap:6px; padding:16px; margin-bottom:18px; border:2px solid #2563eb; border-radius:12px; background:#eff6ff; color:#1e3a8a; }
.employee-submit > .btn { margin-bottom:12px; }
</style>
