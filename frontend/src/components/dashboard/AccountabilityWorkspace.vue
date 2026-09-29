<template>
  <section v-if="access.enabled || access.manager" class="accountability">
    <button class="workspace-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span><strong>Monthly accountability</strong><small>Home office receipts · Personal vehicle mileage · Signed monthly PDF</small></span>
      <span>{{ expanded ? 'Close' : 'Open' }}</span>
    </button>
    <div v-if="expanded" class="workspace-body">
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="notice" role="status" class="notice">{{ notice }}</p>
      <label class="view-picker">View
        <select v-model="view" :disabled="busy">
          <option v-if="access.enabled" value="expenses">Home office expenses</option>
          <option v-if="access.enabled" value="mileage">Personal vehicle mileage</option>
          <option v-if="access.enabled" value="submit">Review, sign &amp; submit</option>
          <option v-if="access.manager" value="settings">Permissions &amp; parameters</option>
        </select>
      </label>
      <template v-if="view === 'settings' && access.manager">
        <p>Access is restricted to the verified work accounts for Rachel Finch, Michael Mendez, and Melissa Mendez for ITSCO; Melissa Mendez also for PlotTwistCO. Other accounts cannot be added. Switch organizations to configure its separate approval.</p>
        <form class="settings" @submit.prevent="saveSettings">
          <label>Account<select v-model="selectedUser" required :disabled="busy" @change="chooseUser"><option value="">Select a verified account</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.first_name }} {{ user.last_name }} — {{ user.email }}</option></select></label>
          <template v-if="selectedUser">
            <label class="check"><input v-model="grantEnabled" type="checkbox" /> Permit this account to use monthly accountability</label>
            <label>Recipient email<input v-model="settings.recipient" type="email" required /></label>
            <label>Approved home office address<input v-model="settings.officeAddress" maxlength="300" required /></label>
            <label>Plan parameters / document wording<textarea v-model="settings.policy" rows="5" maxlength="6000" required placeholder="Enter the approved plan parameters and reimbursement instructions." /></label>
            <label>Mileage reimbursement rate ($ per mile)<input v-model.number="settings.mileageRate" type="number" min="0" max="10" step="0.0001" required /></label>
            <p>Set the business allocation for each category for this person and company. Only the allocated portion is requested.</p>
            <div v-for="(category, index) in settings.categories" :key="index" class="category-settings">
              <label>Key<input v-model="category.key" pattern="[a-z][a-z0-9_]*" maxlength="40" required /></label>
              <label>Category<input v-model="category.label" maxlength="80" required /></label>
              <label>Business %<input v-model.number="category.percent" type="number" min="0" max="100" step="0.01" required /></label>
              <button type="button" class="btn btn-secondary" @click="settings.categories.splice(index, 1)">Remove</button>
            </div>
            <button type="button" class="btn btn-secondary" @click="settings.categories.push({ key: '', label: '', percent: 0 })">Add category</button>
            <label>Certification text<textarea v-model="settings.attestation" rows="4" maxlength="3000" required /></label>
            <button class="btn btn-primary" :disabled="busy">Save permission &amp; parameters</button>
          </template>
        </form>
      </template>
      <template v-else-if="access.enabled">
        <div class="toolbar">
          <label>Month<input v-model="selectedMonth" type="month" :disabled="busy" /></label>
          <button class="btn btn-secondary" :disabled="busy || !selectedMonth || dirty" @click="loadMonth">Open month</button>
          <label v-if="history.length">Saved reports<select :value="report?.month || ''" :disabled="busy || dirty" @change="selectedMonth = $event.target.value; loadMonth()"><option value="" disabled>Select month</option><option v-for="item in history" :key="item.id" :value="item.report_month">{{ item.report_month }} — {{ item.status }} / {{ deliveryLabel(item.delivery_status) }}</option></select></label>
        </div>
        <template v-if="report">
          <div class="report-bar"><strong>{{ report.month }} · {{ report.status === 'signed' ? 'Signed — locked' : dirty ? 'Unsaved changes' : 'Draft saved' }}</strong><span>Requested: {{ money(totalCents) }}</span></div>
          <p v-if="!signed" class="hint">Save or print this worksheet as often as needed, including unfinished rows. Printing does not submit or lock it. You can make adjustments and print again.</p>
          <p v-if="dirty" class="hint">Save your changes before opening another month or leaving this workspace.</p>
          <fieldset :disabled="busy || signed">
            <template v-if="view === 'expenses'">
              <p>Attach receipts to each expense. Business allocations come from your approved parameters.</p>
              <section v-for="category in report.settings.categories" :key="category.key" class="category">
                <div class="category-title"><h3>{{ category.label }}</h3><span>{{ category.percent }}% business allocation</span><button v-if="!signed" class="btn btn-secondary" @click="addExpense(category.key)">Add expense</button></div>
                <p v-if="!report.data.expenses.some(e => e.category === category.key)" class="hint">No expenses added for this category.</p>
                <div v-if="report.data.expenses.some(e => e.category === category.key)" class="table-scroll sheet-scroll">
                  <table class="entry-sheet"><caption>{{ category.label }} worksheet — edit cells and use Tab to move between them</caption>
                    <thead><tr><th>Date</th><th>Vendor</th><th>Receipt amount ($)</th><th>Requested</th><th>Notes</th><th>Receipts</th><th v-if="!signed">Actions</th></tr></thead>
                    <tbody><tr v-for="expense in report.data.expenses.filter(e => e.category === category.key)" :key="expense.id">
                      <td><input v-model="expense.date" aria-label="Expense date" type="date" :min="monthStart" :max="monthEnd" /></td>
                      <td><input v-model="expense.vendor" aria-label="Vendor" maxlength="160" placeholder="Vendor" /></td>
                      <td><input v-model.number="expense.amount" aria-label="Receipt amount" type="number" min="0.01" step="0.01" placeholder="Amount" /></td>
                      <td>{{ expense.amount == null || expense.amount === '' ? '—' : money(Math.round(Number(expense.amount) * category.percent)) }}</td>
                      <td><input v-model="expense.notes" aria-label="Expense notes" maxlength="500" placeholder="Notes" /></td>
                      <td><ul v-if="receiptsFor(expense.id).length"><li v-for="receipt in receiptsFor(expense.id)" :key="receipt.id">{{ receipt.original_name }} <button type="button" class="link" @click="downloadReceipt(receipt)">Download</button> <button v-if="!signed" type="button" class="link" @click="removeReceipt(receipt)">Remove receipt</button></li></ul>
                        <label v-if="!signed">Attach receipt<input type="file" accept="application/pdf,image/png,image/jpeg" @change="attachReceipt(expense.id, $event)" /></label>
                      </td>
                      <td v-if="!signed"><button class="link" :disabled="receiptsFor(expense.id).length > 0" @click="report.data.expenses = report.data.expenses.filter(e => e.id !== expense.id)">Remove expense</button></td>
                    </tr></tbody>
                  </table>
                </div>
              </section>
            </template>
            <template v-if="view === 'mileage'">
              <p>Record business use of your personal vehicle throughout the month. Rate: ${{ report.settings.mileageRate }} / mile. Enter trips not already requested through payroll or another company.</p>
              <div v-if="!signed" class="import-box"><label>Paste from a mileage tracker or spreadsheet<textarea v-model="pasteText" rows="5" placeholder="Date&#9;From&#9;To&#9;Purpose&#9;Miles&#9;Notes" /></label><p class="hint">Include headers: Date, From, To, Purpose, Miles, Notes. CSV or spreadsheet tabs; dates YYYY-MM-DD or M/D/YYYY.</p><button class="btn btn-secondary" @click="previewImport">Preview import</button>
                <div v-if="importRows.length" class="import-preview"><p>{{ importRows.length }} trips ready to review.</p><div class="table-scroll"><table><thead><tr><th>Date</th><th>From → To</th><th>Purpose</th><th>Miles</th></tr></thead><tbody><tr v-for="(trip, i) in importRows" :key="i"><td>{{ trip.date }}</td><td>{{ trip.start }} → {{ trip.end }}</td><td>{{ trip.purpose }}</td><td>{{ trip.miles }}</td></tr></tbody></table></div><button class="btn btn-primary" @click="addImport">Add previewed trips</button></div>
              </div>
              <button v-if="!signed" class="btn btn-secondary" @click="addTrip">Add trip</button>
              <div v-if="report.data.mileage.length" class="table-scroll sheet-scroll">
                <table class="entry-sheet"><caption>Mileage worksheet — edit cells and use Tab to move between them</caption>
                  <thead><tr><th>Date</th><th>From</th><th>To</th><th>Business purpose</th><th>Miles</th><th>Notes</th><th v-if="!signed">Actions</th></tr></thead>
                  <tbody><tr v-for="trip in report.data.mileage" :key="trip.id">
                    <td><input v-model="trip.date" aria-label="Trip date" type="date" :min="monthStart" :max="monthEnd" /></td>
                    <td><input v-model="trip.start" aria-label="Starting location" maxlength="200" placeholder="From" /></td>
                    <td><input v-model="trip.end" aria-label="Destination" maxlength="200" placeholder="To" /></td>
                    <td><input v-model="trip.purpose" aria-label="Business purpose" maxlength="500" placeholder="Purpose" /></td>
                    <td><input v-model.number="trip.miles" aria-label="Business miles" type="number" min="0.01" step="0.01" placeholder="Miles" /></td>
                    <td><input v-model="trip.notes" aria-label="Trip notes" maxlength="500" placeholder="Notes" /></td>
                    <td v-if="!signed"><button class="link" @click="report.data.mileage = report.data.mileage.filter(t => t.id !== trip.id)">Remove trip</button></td>
                  </tr></tbody>
                </table>
              </div>
              <p v-if="!report.data.mileage.length" class="hint">No trips recorded yet.</p>
            </template>
          </fieldset>
          <template v-if="view === 'submit'">
            <h3>Review your monthly report</h3><p>Approved office: {{ report.settings.officeAddress }}</p><p class="preserve-lines">{{ report.settings.policy }}</p>
            <p>{{ report.data.expenses.length }} expenses · {{ report.data.mileage.length }} trips · {{ report.receipts.length }} receipts</p>
            <p><strong>Total requested: {{ money(totalCents) }}</strong></p><p>The signed PDF includes your entries, parameters, and receipts. It will be sent to <strong>{{ report.settings.recipient }}</strong>.</p>
            <fieldset v-if="!signed" :disabled="busy"><label class="check"><input v-model="attested" type="checkbox" />{{ report.settings.attestation }}</label><SignaturePad :key="report.id + ':' + signatureRevision" @signed="signature = $event" /><p>Only submitting locks this report and its receipts. Saving, downloading, and printing keep it editable.</p><button class="btn btn-primary" :disabled="busy || !attested || !signature" @click="signAndSend">Submit signed report &amp; email</button></fieldset>
            <div v-else role="status"><p><strong>Delivery: {{ deliveryLabel(report.deliveryStatus) }}</strong></p><p>{{ report.deliveryDetail }}</p><button v-if="['not_sent', 'failed'].includes(report.deliveryStatus)" class="btn btn-primary" :disabled="busy" @click="sendReport">{{ report.deliveryStatus === 'failed' ? 'Retry email' : 'Email signed PDF' }}</button></div>
          </template>
          <div class="toolbar footer"><button v-if="!signed" class="btn btn-primary" :disabled="busy || !dirty" @click="saveDraft">{{ busy ? 'Working…' : 'Save monthly draft' }}</button><button v-if="dirty" class="btn btn-secondary" :disabled="busy" @click="reloadDraft">Discard changes &amp; reload</button><button class="btn btn-secondary" :disabled="busy" @click="openPdf(false)">Download {{ signed ? 'signed' : 'draft' }} PDF</button><button class="btn btn-secondary" :disabled="busy" @click="openPdf(true)">Print / preview PDF</button></div>
          <p v-if="signed" class="hint">Your signed report is preserved. Use the PDF buttons to print or download all entries and receipts.</p>
        </template>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import { mergeMileage, parseMileagePaste } from '../../utils/accountabilityMileage';

const props = defineProps({ agencyId: { type: [Number, String], default: null } });
const access = ref({}); const expanded = ref(false); const view = ref('expenses'); const busy = ref(false); const error = ref(''); const notice = ref('');
const report = ref(null); const history = ref([]); const savedData = ref('');
const selectedMonth = ref(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const users = ref([]); const grants = ref([]); const selectedUser = ref(''); const grantEnabled = ref(false); const settings = ref({});
const signature = ref(null); const signatureRevision = ref(0); const attested = ref(false); const pasteText = ref(''); const importRows = ref([]);
const base = computed(() => `/accountability/${props.agencyId}`);
const signed = computed(() => report.value?.status === 'signed');
const dirty = computed(() => !!report.value && !signed.value && JSON.stringify(report.value.data) !== savedData.value);
const monthStart = computed(() => `${report.value?.month}-01`);
const monthEnd = computed(() => { const [y, m] = (report.value?.month || '2000-01').split('-').map(Number); return `${report.value?.month}-${new Date(y, m, 0).getDate()}`; });
const totalCents = computed(() => {
  if (!report.value) return 0;
  const { data, settings: s } = report.value;
  return data.expenses.reduce((sum, e) => sum + Math.round(Number(e.amount || 0) * (s.categories.find(c => c.key === e.category)?.percent || 0)), 0) + data.mileage.reduce((sum, t) => sum + Math.round(Number(t.miles || 0) * s.mileageRate * 100), 0);
});
const deliveryLabel = value => ({ not_sent: 'Not sent', sending: 'Sending', sent: 'Sent', failed: 'Not sent — retry available', unknown: 'Delivery unconfirmed', queued: 'Queued / awaiting approval', redirected: 'Redirected to test inbox' }[value] || value);
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const receiptsFor = id => report.value.receipts.filter(r => r.expense_id === id);
const defaultSettings = () => ({ recipient: 'melissa@plottwistco.com', officeAddress: '', policy: '', mileageRate: '', categories: ['Utilities', 'Phone', 'Internet'].map(label => ({ key: label.toLowerCase(), label, percent: 0 })), attestation: 'I certify that these expenses and trips were incurred for the stated business purposes, that the attached records are accurate, and that the requested amounts have not been reimbursed or claimed through payroll or another organization.' });
async function action(fn) { if (busy.value) return; busy.value = true; error.value = ''; notice.value = ''; try { await fn(); } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Unable to complete this action.'; } finally { busy.value = false; } }
function acceptReport(value) { report.value = value; savedData.value = JSON.stringify(value.data); signature.value = null; attested.value = false; signatureRevision.value++; }
async function refreshReport() { const { data } = await api.post(`${base.value}/reports`, { month: report.value.month }); acceptReport(data); }
async function refreshHistory() { history.value = (await api.get(`${base.value}/reports`)).data; }
async function loadMonth() { await action(async () => { if (dirty.value) throw new Error('Save your draft before changing months.'); const { data } = await api.post(`${base.value}/reports`, { month: selectedMonth.value }); acceptReport(data); pasteText.value = ''; importRows.value = []; await refreshHistory(); }); }
async function saveInternal() { if (!dirty.value) return; const { data } = await api.put(`${base.value}/reports/${report.value.id}`, { version: report.value.version, data: report.value.data }); acceptReport(data); }
async function reloadDraft() { await action(refreshReport); }
async function saveDraft() { await action(async () => { await saveInternal(); notice.value = 'Monthly draft saved. You can return and continue throughout the month.'; }); }
function addExpense(category) { report.value.data.expenses.push({ id: crypto.randomUUID(), category, date: monthStart.value, vendor: '', amount: '', notes: '' }); }
function addTrip() { report.value.data.mileage.push({ id: crypto.randomUUID(), date: monthStart.value, start: '', end: '', purpose: '', miles: '', notes: '' }); }
function previewImport() { error.value = ''; importRows.value = []; try { importRows.value = parseMileagePaste(pasteText.value, report.value.month); } catch (e) { error.value = e.message; } }
function addImport() { const merged = mergeMileage(report.value.data.mileage, importRows.value); if (merged.rows.length > 500) { error.value = 'A monthly report can contain at most 500 trips.'; return; } report.value.data.mileage = merged.rows; notice.value = `${merged.added} trips added; ${merged.skipped} duplicate trips skipped. Save your monthly draft to keep them.`; importRows.value = []; pasteText.value = ''; }
async function attachReceipt(expenseId, event) { const file = event.target.files?.[0]; if (!file) return; await action(async () => { if (file.size > 8 * 1024 * 1024) throw new Error('Choose a receipt smaller than 8 MB.'); await saveInternal(); const form = new FormData(); form.append('expenseId', expenseId); form.append('version', String(report.value.version)); form.append('receipt', file); await api.post(`${base.value}/reports/${report.value.id}/receipts`, form); await refreshReport(); notice.value = 'Receipt attached and saved.'; }); event.target.value = ''; }
async function removeReceipt(receipt) { await action(async () => { await saveInternal(); await api.delete(`${base.value}/reports/${report.value.id}/receipts/${receipt.id}`, { data: { version: report.value.version } }); await refreshReport(); }); }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
async function downloadReceipt(receipt) { await action(async () => { const { data } = await api.get(`${base.value}/reports/${report.value.id}/receipts/${receipt.id}`, { responseType: 'blob' }); downloadBlob(data, receipt.original_name); }); }
async function openPdf(print) {
  const previewWindow = print ? window.open('', '_blank') : null;
  if (previewWindow) previewWindow.document.title = 'Preparing accountability PDF…';
  await action(async () => { try { await saveInternal(); const { data } = await api.get(`${base.value}/reports/${report.value.id}/pdf`, { responseType: 'blob' }); if (previewWindow) { const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' })); previewWindow.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); notice.value = signed.value ? 'Signed PDF opened for printing.' : 'Working copy opened for printing. Your draft remains editable and has not been submitted.'; } else { downloadBlob(data, `accountability-${report.value.month}.pdf`); if (print) notice.value = 'The popup was blocked. Open the downloaded PDF to print.'; } } catch (e) { previewWindow?.close(); throw e; } });
}
async function sendInternal() { const { data } = await api.post(`${base.value}/reports/${report.value.id}/send`); await refreshReport(); await refreshHistory(); notice.value = data.deliveryDetail; }
async function sendReport() { await action(sendInternal); }
async function signAndSend() { await action(async () => { const signedImage = signature.value; const accepted = attested.value; const reviewedSettings = JSON.parse(JSON.stringify(report.value.settings)); await saveInternal(); await api.post(`${base.value}/reports/${report.value.id}/sign`, { version: report.value.version, signature: signedImage, attested: accepted, settings: reviewedSettings }); await refreshReport(); await sendInternal(); }); }
function chooseUser() { const grant = grants.value.find(g => Number(g.userId) === Number(selectedUser.value)); grantEnabled.value = grant?.enabled || false; settings.value = JSON.parse(JSON.stringify(grant?.settings || defaultSettings())); }
async function saveSettings() { await action(async () => { await api.put(`${base.value}/settings/${selectedUser.value}`, { enabled: grantEnabled.value, settings: settings.value }); const result = (await api.get(`${base.value}/settings`)).data; users.value = result.users; grants.value = result.grants; access.value = (await api.get(`${base.value}/access`)).data; notice.value = 'Permission and parameters saved for this account and organization.'; }); }
let loadSequence = 0;
watch(() => props.agencyId, async id => {
  const sequence = ++loadSequence;
  access.value = {}; report.value = null; savedData.value = ''; history.value = []; selectedUser.value = ''; error.value = ''; expanded.value = false;
  if (!id) return;
  try { const result = (await api.get(`/accountability/${id}/access`)).data; if (sequence !== loadSequence) return; access.value = result; view.value = result.enabled ? 'expenses' : 'settings'; }
  catch { /* Restricted workspace stays hidden for unauthorized accounts. */ }
}, { immediate: true });
watch(expanded, async value => { if (!value) return; await action(async () => { if (access.value.manager) { const { data } = await api.get(`${base.value}/settings`); users.value = data.users; grants.value = data.grants; } if (access.value.enabled) await refreshHistory(); }); });
watch(() => report.value?.data, () => { if (dirty.value) { signature.value = null; attested.value = false; signatureRevision.value++; } }, { deep: true });
watch(pasteText, () => { importRows.value = []; });
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<style scoped>
.accountability { margin: 16px 0; border: 1px solid var(--border-color, #d6dce4); border-radius: 14px; background: var(--bg-primary, #fff); color: var(--text-primary, #253246); }
.workspace-toggle { width: 100%; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:20px; border:0; border-radius:14px; background:transparent; color:inherit; cursor:pointer; text-align:left; font:inherit; }
.workspace-toggle strong { font-size:1.1rem; }.workspace-toggle small { display:block; margin-top:6px; opacity:.75; }
.workspace-body { padding:0 20px 20px; }label { display:flex; flex-direction:column; gap:6px; font-weight:500; font-size:.9rem; }input, select, textarea { padding:10px; border:1px solid var(--border-color, #cbd5e1); border-radius:7px; background:var(--bg-primary, #fff); color:inherit; font:inherit; min-width:0; width:100%; box-sizing:border-box; }textarea { resize:vertical; }.view-picker { max-width:370px; margin-bottom:20px; }.toolbar,.category-title,.category-settings { display:flex; gap:12px; flex-wrap:wrap; align-items:end; }.toolbar label { flex:1; min-width:160px; }.toolbar button { min-height:42px; }.report-bar { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:15px; margin:20px 0; background:var(--bg-secondary, #f0f5f8); border-radius:8px; }.settings { display:grid; gap:16px; max-width:900px; }.category-settings label { flex:1; min-width:100px; }.category { border-top:1px solid var(--border-color, #d6dce4); padding:16px 0; }.category-title { align-items:center; }.category-title h3 { margin:0; }.category-title span { flex:1; font-size:.85rem; opacity:.8; }.expense,.import-box { border:1px solid var(--border-color, #d6dce4); padding:16px; border-radius:10px; margin:14px 0; }.entry-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.check { flex-direction:row; align-items:flex-start; line-height:1.5; }.check input { width:18px; height:18px; flex:0 0 18px; margin-top:4px; padding:0; }.error { background:#fff0ef; color:#9b2424; padding:12px; border-radius:7px; }.notice { background:#eaf6f2; color:#17604a; padding:12px; border-radius:7px; }.hint { font-size:.86rem; opacity:.8; }.link { border:0; background:transparent; color:var(--primary-color, #246b92); padding:6px; text-decoration:underline; cursor:pointer; }.link:disabled { opacity:.4; cursor:default; }.footer { margin-top:20px; }.preserve-lines { white-space:pre-wrap; }fieldset { margin:0; padding:0; border:0; min-width:0; }fieldset:disabled { opacity:.8; }.table-scroll { overflow:auto; max-height:280px; margin:12px 0; }table { width:100%; border-collapse:collapse; }td,th { text-align:left; padding:8px; border-bottom:1px solid var(--border-color, #ddd); }.btn { white-space:normal; }
.sheet-scroll { max-height:none; }.entry-sheet { min-width:1050px; }.entry-sheet caption { text-align:left; padding:10px 0; font-size:.85rem; }.entry-sheet td { vertical-align:top; }.entry-sheet input:not([type="file"]) { min-width:125px; }.entry-sheet input[type="file"] { width:210px; }.entry-sheet th { white-space:nowrap; }.entry-sheet ul { padding-left:16px; }
@media(max-width:640px) { .workspace-body { padding:0 12px 16px; }.workspace-toggle { padding:16px 12px; }.entry-grid { grid-template-columns:1fr; }.toolbar>* { width:100%; }.category-settings { padding-bottom:12px; border-bottom:1px solid #ddd; } }
</style>
