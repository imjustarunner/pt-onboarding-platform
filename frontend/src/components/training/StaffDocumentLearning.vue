<template>
  <section v-if="state.courses.length || error" class="staff-guide-learning">
    <h3>Guide training · {{ agencyName || 'This company' }}</h3>
    <p v-if="error" role="alert">{{ error }} <button @click="load">Retry</button></p>
    <template v-if="state.courses.length">
      <label v-if="state.courses.some(c => c.key === 'school-practice-guide')"><input v-model="expectedSchoolWork" type="checkbox" :disabled="busy || readonly || !state.canAssign" /> Expected to work in schools</label>
      <p>Required guide modules appear in the employee’s onboarding. Assign paid refreshers below; optional on-demand review is on the employee’s own time.</p>
      <button v-if="state.courses.some(c => c.key === 'school-practice-guide') && !readonly && state.canAssign && expectedSchoolWork !== state.expectedSchoolWork" :disabled="busy" @click="savePreference">Save school-work setting</button>
      <article v-for="course in state.courses" :key="course.key"><strong>{{ course.title }}</strong><p>{{ ['ready', 'beta'].includes(course.status) ? 'Ready to assign · Paid active training time' : course.status === 'unpublished' ? 'Publish the company guide first.' : 'Review the quiz for the current edition before assigning.' }}</p><p v-for="record in course.enrollments.filter(r => r.purpose !== 'practice')" :key="record.id">{{ record.purpose === 'onboarding' ? 'Onboarding' : 'Assigned refresher' }} · {{ record.status === 'completed' ? 'Completed' : 'In progress' }}</p><button v-if="!readonly && state.canAssign && ['ONBOARDING', 'ACTIVE_EMPLOYEE'].includes(state.learnerStatus)" :disabled="busy || !['ready', 'beta'].includes(course.status) || course.enrollments.some(r => r.purpose === 'assigned' && r.status !== 'completed' && Number(r.version_id) === Number(course.version?.id))" @click="assign(course)">Assign paid refresher</button></article>
      <p v-if="notice" role="status">{{ notice }}</p>
    </template>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, userId: { type: [Number, String], required: true }, agencyName: String, readonly: Boolean });
const state = ref({ courses: [] }), error = ref(''), busy = ref(false), expectedSchoolWork = ref(false), notice = ref('');
let sequence = 0; const keys = new Map();
async function load() { const current = ++sequence; error.value = ''; try { const { data } = await api.get(`/provider-update/document-learning/staff/${props.userId}`, { params: { agencyId: props.agencyId } }); if (current === sequence) { state.value = data; expectedSchoolWork.value = data.expectedSchoolWork; } } catch(e) { if (current === sequence && e.response?.status !== 403) error.value = e.response?.data?.error?.message || 'Guide training could not be loaded.'; } }
async function savePreference() { busy.value = true; error.value = ''; try { await api.put(`/provider-update/document-learning/staff/${props.userId}/preference`, { agencyId: props.agencyId, expectedSchoolWork: expectedSchoolWork.value }); await load(); notice.value = 'School-work setting saved.'; } catch(e) { error.value = e.response?.data?.error?.message || 'The setting could not be saved.'; } finally { busy.value = false; } }
async function assign(course) { busy.value = true; error.value = ''; if (!keys.has(course.key)) keys.set(course.key, crypto.randomUUID()); try { await api.post(`/provider-update/document-learning/staff/${props.userId}/${course.key}/assign`, { agencyId: props.agencyId, expectedVersionId: course.version.id, expectedBetaRevision: course.betaRevision, requestKey: keys.get(course.key) }); keys.delete(course.key); await load(); notice.value = 'Paid training assigned. It is now available in the employee’s training area.'; } catch(e) { error.value = e.response?.data?.error?.message || 'Training could not be assigned.'; } finally { busy.value = false; } }
watch(() => [props.agencyId, props.userId], () => { state.value = { courses: [] }; keys.clear(); load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.staff-guide-learning{background:#f2f6ec;border:1px solid #d7e2cf;border-radius:12px;padding:24px;margin:20px 0;color:#294432}.staff-guide-learning p{font-size:13px;line-height:1.8}.staff-guide-learning article{padding:18px 0;border-top:1px solid #d5dfcd;margin-top:18px}.staff-guide-learning button{padding:10px 14px;border:1px solid #b9cdb3;border-radius:6px;background:white;color:#285133;cursor:pointer}.staff-guide-learning button:disabled{opacity:.5}.staff-guide-learning label{display:flex;gap:10px;align-items:center;font-size:14px}.staff-guide-learning [role=alert]{color:#943a2c}
</style>
