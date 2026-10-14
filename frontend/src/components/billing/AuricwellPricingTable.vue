<template>
  <section class="auricwell-prices" aria-label="AuricWell monthly pricing">
    <h3>Monthly pricing for your practice</h3>
    <p>USD per month. One administrator and support / billing staff are included. Choose one practice tier and one billing category per person.</p>
    <div class="scroll"><table><caption>Practice and seat prices</caption><thead><tr><th>Monthly charge</th><th v-for="p in AURICWELL_PLANS" :key="p.id">{{ p.name }}</th></tr></thead><tbody>
      <tr><th>Practice base · includes one administrator</th><td v-for="p in AURICWELL_PLANS" :key="p.id">{{ money(p.baseCents) }}</td></tr>
      <tr v-for="(label,key) in labels" :key="key"><th>{{ label }}</th><td v-for="p in AURICWELL_PLANS" :key="p.id">{{ key === 'support' ? 'Included' : money(p.seats[key]) }}</td></tr>
    </tbody></table></div>
    <div class="scroll"><table><caption>Monthly practice allowance + allowance for each clinical seat</caption><thead><tr><th>Usage</th><th v-for="p in AURICWELL_PLANS" :key="p.id">{{ p.name }}</th><th>Overage</th></tr></thead><tbody>
      <tr v-for="(meter,key) in AURICWELL_METERS" :key="key"><th>{{ meter.label }}</th><td v-for="p in AURICWELL_PLANS" :key="p.id">{{ p.included[key].toLocaleString() }} + {{ p.perClinicalSeat[key].toLocaleString() }} / clinical seat</td><td>${{ (meter.overageMicros / 1000000).toFixed(key === 'video' ? 3 : 2) }} / {{ meter.unit }}</td></tr>
    </tbody></table></div>
    <details><summary>How seats, allowances and additional charges work</summary><ul><li v-for="rule in AURICWELL_PRICING_RULES" :key="rule">{{ rule }}</li></ul></details>
    <p class="note">Rate card {{ AURICWELL_PRICING_VERSION }}. A quote is confirmed in your practice agreement before billing starts.</p>
  </section>
</template>
<script setup>
import { AURICWELL_PLANS, AURICWELL_METERS, AURICWELL_PRICING_RULES, AURICWELL_PRICING_VERSION } from '../../config/auricwellPricing.js';
const labels = { administrator: 'Additional administrator', independent: 'Independently billing provider / supervisor', supervised: 'Supervised billing provider / intern', support: 'Support / billing staff' };
const money = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);
</script>
<style scoped>
.auricwell-prices{padding:20px 0;color:var(--text-primary,#173e32)}h3{font-size:1.3rem;margin:0 0 10px}p,li{line-height:1.6}.scroll{overflow:auto;margin:20px 0}table{width:100%;border-collapse:collapse;min-width:640px;background:var(--bg-card,#fff)}caption{text-align:left;font-weight:600;padding:12px 0}th,td{padding:14px;text-align:left;border-bottom:1px solid var(--border-color,#d9e6df)}thead{background:var(--bg-secondary,#edf5f0)}tbody th{font-weight:500}summary{cursor:pointer;font-weight:600}.note{font-size:.85rem;color:var(--text-secondary,#53685e)}li{margin:10px 0}
</style>
