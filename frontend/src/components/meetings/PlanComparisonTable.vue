<template>
  <section class="plan-comparison" aria-labelledby="plans-title">
    <header>
      <p class="eyebrow">Basic · Premium · Premium Plus</p>
      <h2 id="plans-title">A plan for your practice</h2>
      <p>Documentation Hub is included in every plan. Premium includes Basic; Premium Plus includes both.</p>
    </header>
    <div class="plan-tools">
      <label>Find a feature<input v-model="search" type="search" placeholder="Search features" /></label>
      <label>Product<select v-model="product"><option value="all">All features</option><option value="auricwell">AuricWell</option><option value="platform">Platform</option></select></label>
    </div>
    <p class="plan-note">Shared features follow your agency’s plan for its staff. Private virtual offices follow the provider’s plan. Platform-only features are labeled below.</p>
    <div class="plan-scroll" tabindex="0" role="region" aria-label="Feature comparison; scroll horizontally on smaller screens">
      <table>
        <caption>● Included · — Not included. Separate features are outside all three plans.</caption>
        <thead><tr><th scope="col">Feature</th><th v-for="tier in PLAN_TIERS" :key="tier.id" scope="col">{{ tier.name }}</th></tr></thead>
        <tbody v-for="group in groups" :key="group.name">
          <tr class="category"><th colspan="4" scope="rowgroup">{{ group.name }}</th></tr>
          <tr v-for="feature in group.features" :key="feature.key" :data-feature="feature.key">
            <th scope="row">
              <span>{{ feature.label }}</span>
              <small>{{ feature.description }}</small>
              <span v-if="!feature.products.includes('auricwell')" class="badge">Platform only</span>
              <span v-if="feature.minimumTier === 'separate'" class="badge">Separate / not included</span>
              <span v-if="feature.aliasOf" class="badge">Included with Focus Package</span>
            </th>
            <td v-for="tier in PLAN_TIERS" :key="tier.id">
              <span aria-hidden="true" :class="{ included: includes(feature, tier.id) }">{{ includes(feature, tier.id) ? '●' : '—' }}</span>
              <span class="sr-only">{{ includes(feature, tier.id) ? 'Included' : 'Not included' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!groups.length" role="status">No features match your search.</p>
    </div>
    <p class="plan-note">Existing accounts receive Premium Plus access. Features marked separate retain their own availability and setup requirements. Your role, agency settings, and required consent still apply. Private office guests always need a snapshot and individual provider admission.</p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
import { PLAN_TIERS, PLAN_FEATURES } from '../../config/productPlanCatalog.js';
const search = ref('');
const product = ref('all');
const ranks = Object.fromEntries(PLAN_TIERS.map((tier, index) => [tier.id, index]));
const includes = (feature, tier) => feature.minimumTier in ranks && ranks[tier] >= ranks[feature.minimumTier];
const groups = computed(() => {
  const matching = PLAN_FEATURES.filter(feature =>
    (product.value === 'all' || feature.products.includes(product.value)) &&
    `${feature.label} ${feature.description}`.toLowerCase().includes(search.value.trim().toLowerCase())
  );
  const result = new Map();
  for (const feature of matching) {
    const category = feature.minimumTier === 'separate' ? 'Separate features' : feature.category;
    if (!result.has(category)) result.set(category, []);
    result.get(category).push(feature);
  }
  return [...result].sort(([a], [b]) => (a === 'Separate features') - (b === 'Separate features'))
    .map(([name, features]) => ({ name, features }));
});
</script>
<style scoped>
.plan-comparison{max-width:1100px;margin:48px auto;padding:clamp(16px,3vw,32px);border-radius:20px;background:#f1f7f3;color:#153e31}
.plan-comparison h2{font-size:clamp(1.6rem,3vw,2.2rem);margin:0}.eyebrow{font-size:.8rem;font-weight:700;letter-spacing:.04em}
.plan-tools{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}.plan-tools label{display:grid;gap:6px;font-size:.85rem;font-weight:600}.plan-tools input,.plan-tools select{font:inherit;padding:10px 12px;border:1px solid #acc7b7;border-radius:8px;background:white;color:#153e31;max-width:100%;box-sizing:border-box}
.plan-scroll{position:relative;overflow:auto;max-height:720px;border:1px solid #c7dcd0;border-radius:10px;background:white}.plan-comparison table{width:100%;border-collapse:separate;border-spacing:0;min-width:600px}.plan-comparison caption{text-align:left;font-size:.8rem;padding:12px;background:#f1f7f3}.plan-comparison th,.plan-comparison td{padding:16px;border-bottom:1px solid #dbe8e0;text-align:center}.plan-comparison th:first-child{text-align:left}.plan-comparison thead th{position:sticky;top:0;background:#214b39;color:white;z-index:1}.plan-comparison tbody th{width:55%;font-weight:600}.plan-comparison small{display:block;font-weight:400;font-size:.8rem;line-height:1.5;color:#4d665a;margin-top:5px}.plan-comparison td{font-size:1.2rem;color:#78887f}.included{color:#276b42}.category th{background:#e5f0e9;font-size:.85rem}.badge{display:inline-block;font-size:.7rem;font-weight:500;background:#edf0ee;padding:3px 7px;border-radius:6px;margin:7px 6px 0 0}.plan-note{font-size:.85rem;line-height:1.6}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
