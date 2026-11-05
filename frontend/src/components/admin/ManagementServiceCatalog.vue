<template>
  <section class="journey-card service-catalog">
    <h4>PlotTwistCo service prices</h4>
    <p>Starting rates are approximately 75% of the supplied price ranges. Managed companies receive {{ discountPercent }}% off eligible services. Included services are charged through the management package.</p>
    <p v-if="error" class="journey-error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading" role="status">Loading service prices…</p>
    <template v-else-if="catalog">
      <div class="journey-actions">
        <label>Category<select v-model="category"><option value="">All service types</option><option v-for="group in categories" :key="group.key" :value="group.key">{{ group.label }}</option></select></label>
        <label class="journey-check"><input v-model="managed" type="checkbox">Managed-company prices</label>
        <button v-if="canEditCatalog" type="button" class="btn btn-secondary" @click="editing = !editing">{{ editing ? 'Close price editor' : 'Edit service prices' }}</button>
      </div>
      <template v-if="editing && canEditCatalog">
        <label>Managed-company discount (%)<input type="number" min="0" max="100" step="0.01" :value="catalog.managedDiscountBps / 100" @input="catalog.managedDiscountBps = Math.round(Number($event.target.value) * 100)"></label>
        <p>Price edits apply to future selections. Existing saved agreements and invoices keep their agreed prices.</p>
      </template>
      <div v-for="item in visibleServices" :key="item.id" class="catalog-service">
        <template v-if="editing && canEditCatalog">
          <div class="journey-fields">
            <label>Service name<input v-model="item.name" maxlength="160"></label>
            <label>Type<select v-model="item.category"><option v-for="group in categories" :key="group.key" :value="group.key">{{ group.label }}</option></select></label>
            <label v-if="isPercentage(item)">Starting rate (%)<input type="number" min="0" max="100" step="0.01" :value="item.rateBps / 100" @input="item.rateBps = Math.round(Number($event.target.value) * 100)"></label>
            <label v-else>Starting price ($)<input type="number" min="0" step="0.01" :value="item.amountCents / 100" @input="item.amountCents = Math.round(Number($event.target.value) * 100)"></label>
            <label v-if="item.managedBaseAmountCents != null">Managed starting price before discount ($)<input type="number" min="0" step="0.01" :value="item.managedBaseAmountCents / 100" @input="item.managedBaseAmountCents = Math.round(Number($event.target.value) * 100)"></label>
            <label>Frequency<select :value="item.cadence" @change="changeCadence(item, $event.target.value)"><option value="monthly">Monthly</option><option value="once">One-time</option><option value="annual">Annual</option><option value="collections_percent">% of collections</option><option value="revenue_percent">% of revenue</option><option value="session_revenue_percent">% of in-building session revenue</option></select></label>
          </div>
          <label class="journey-check"><input v-model="item.discountEligible" type="checkbox">Eligible for managed discount</label>
          <label class="journey-check"><input v-model="item.includedInManagement" type="checkbox">Included in full management</label>
          <label>Service details<textarea v-model="item.notes" maxlength="1500" rows="2" /></label>
          <button type="button" class="journey-link" @click="catalog.services = catalog.services.filter(s => s.id !== item.id)">Remove service</button>
        </template>
        <template v-else><strong>{{ item.name }}</strong><p>{{ priceLabel(item) }}<span v-if="managed && item.includedInManagement"> · Included in full management</span></p><p v-if="item.notes" class="journey-muted">{{ item.notes }}</p></template>
        <button v-if="canSelect && !isPercentage(item)" type="button" class="btn btn-secondary" @click="$emit('select', selectedService(item))">Add {{ item.name }} to this agreement</button>
      </div>
      <div v-if="editing && canEditCatalog" class="journey-actions"><button type="button" class="btn btn-secondary" @click="addService">Add a catalog service</button><button type="button" class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save service prices' }}</button><button type="button" class="journey-link" :disabled="saving" @click="load">Discard edits / reload</button></div>
      <p v-if="canSelect" class="journey-muted">Only add selected services. Do not add individual services already included in full management. Annual services become a one-time charge in the selected month; percentage services need their separate agreed billing terms.</p>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ canSelect: Boolean, serviceMonth: { type: String, default: '' } });
defineEmits(['select']);
const catalog = ref(null), categories = ref([]), revision = ref(0), canEditCatalog = ref(false), editing = ref(false), loading = ref(false), saving = ref(false), error = ref(''), message = ref(''), category = ref(''), managed = ref(true);
const discountPercent = computed(() => (catalog.value?.managedDiscountBps ?? 2000) / 100);
const visibleServices = computed(() => catalog.value?.services.filter(s => !category.value || s.category === category.value) || []);
const isPercentage = item => item.cadence.endsWith('_percent');
const price = item => {
  const factor = managed.value && item.discountEligible ? 1 - catalog.value.managedDiscountBps / 10000 : 1;
  const base = managed.value && item.managedBaseAmountCents != null ? item.managedBaseAmountCents : item.amountCents;
  return { amountCents: Math.round(base * factor), rateBps: Math.round(item.rateBps * factor) };
};
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
function priceLabel(item) {
  const value = price(item);
  if (isPercentage(item)) return `${value.rateBps / 100}% ${item.cadence === 'collections_percent' ? 'of collections' : item.cadence === 'session_revenue_percent' ? 'of in-building session revenue' : 'of monthly revenue'}`;
  return `${money(value.amountCents)} ${item.cadence === 'monthly' ? '/ month' : item.cadence === 'annual' ? '/ year' : 'one-time'}`;
}
function selectedService(item) { return { id: `${item.id}-${Date.now()}`, name: item.name, amountCents: price(item).amountCents, cadence: item.cadence === 'monthly' ? 'monthly' : 'once', month: item.cadence === 'monthly' ? '' : props.serviceMonth, catalogServiceId: item.id, includedCatalogIds: item.id === 'full-management' ? catalog.value.services.filter(s => s.includedInManagement).map(s => s.id) : [], separateFromManagement: !item.includedInManagement && item.id !== 'full-management' }; }
function changeCadence(item, cadence) { item.cadence = cadence; if (isPercentage(item)) { item.amountCents = 0; delete item.managedBaseAmountCents; } else item.rateBps = 0; }
function addService() { catalog.value.services.push({ id: `service-${Date.now()}`, name: '', category: category.value || categories.value[0].key, amountCents: 0, rateBps: 0, cadence: 'monthly', discountEligible: true, includedInManagement: false, businessTypes: ['coaching', 'consulting', 'tutoring', 'counseling'], notes: '' }); }
function accept(data) { catalog.value = data.catalog; categories.value = data.categories || []; revision.value = data.revision; canEditCatalog.value = data.canEdit === true; }
async function load() { loading.value = true; error.value = ''; message.value = ''; try { const { data } = await api.get('/business-lifecycle/service-catalog'); if (Array.isArray(data.catalog?.services)) accept(data); } catch (e) { error.value = e.response?.data?.error?.message || 'Service prices could not be loaded.'; } finally { loading.value = false; } }
async function save() { saving.value = true; error.value = ''; message.value = ''; try { const { data } = await api.put('/business-lifecycle/service-catalog', { catalog: catalog.value, revision: revision.value }); accept(data); message.value = 'Service prices saved. Existing agreements keep their recorded prices.'; } catch (e) { error.value = e.response?.data?.error?.message || 'Service prices were not saved. Reload and try again.'; } finally { saving.value = false; } }
onMounted(load);
</script>
<style scoped>
.catalog-service { padding: 18px 0; border-top: 1px solid var(--border-color, #ddd); }
.catalog-service p { margin: 6px 0 12px; }
.service-catalog h4 { margin-top: 0; }
</style>
