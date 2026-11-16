<template>
  <details class="submission-snapshot" aria-label="Approved submission snapshot">
    <summary>{{ practice ? 'Practice submission snapshot — not sent' : 'Approved submission snapshot' }}</summary>
    <p>This preserves the fields approved for this attempt. Clearinghouse responses establish what happened after approval.</p>
    <dl>
      <div><dt>Patient</dt><dd>{{ name(payload,'pat') }}</dd></div>
      <div><dt>Payer / member</dt><dd>{{ payload.payer_name || payload.payerid || 'Not recorded' }} · {{ payload.ins_number || 'Not recorded' }}</dd></div>
      <div v-if="supervision?.serviceProvider"><dt>Treating provider</dt><dd>{{ person(supervision.serviceProvider) }}</dd></div>
      <div><dt>Claim rendering provider · CMS-1500 24J</dt><dd>{{ name(payload,'prov') }} · NPI {{ payload.prov_npi || 'Not recorded' }}</dd></div>
      <div v-if="supervision?.supervisingProvider"><dt>Overseeing provider</dt><dd>{{ person(supervision.supervisingProvider) }}</dd></div>
      <div><dt>Billing entity · CMS-1500 33 / 33a</dt><dd>{{ payload.bill_name || 'Not recorded' }} · NPI {{ payload.bill_npi || 'Not recorded' }}<br />{{ address(payload,'bill') }}</dd></div>
      <div><dt>Submitted facility · CMS-1500 32 / 32a</dt><dd>{{ payload.facility_name || 'Not supplied' }}<br />{{ address(payload,'facility') }}</dd></div>
      <div><dt>Diagnoses · CMS-1500 21</dt><dd>{{ Object.keys(payload).filter(key => /^diag_\d+$/.test(key)).sort().map(key => payload[key]).filter(Boolean).join(', ') || 'Not supplied' }}</dd></div>
    </dl>
    <div class="table-scroll"><table><thead><tr><th>Service date</th><th>Code</th><th>Modifiers · 24D</th><th>Units</th><th>POS · 24B</th><th>Charge</th></tr></thead><tbody><tr v-for="(line,index) in payload.charge || []" :key="index"><td>{{ line.from_date }}<template v-if="line.thru_date && line.thru_date !== line.from_date">–{{ line.thru_date }}</template></td><td>{{ line.proc_code }}</td><td>{{ [line.mod1,line.mod2,line.mod3,line.mod4].filter(Boolean).join(', ') || 'None' }}</td><td>{{ line.units }}</td><td>{{ line.place_of_service || 'Not supplied' }}</td><td>${{ line.charge }}</td></tr></tbody></table></div>
    <details><summary>All approved claim fields</summary><dl><div v-for="([key,value]) in fields(payload)" :key="key"><dt>{{ key }}</dt><dd>{{ display(value) }}</dd></div></dl><section v-for="(line,index) in payload.charge || []" :key="index"><h4>Service line {{ index+1 }}</h4><dl><div v-for="([key,value]) in fields(line)" :key="key"><dt>{{ key }}</dt><dd>{{ display(value) }}</dd></div></dl></section></details>
  </details>
</template>
<script setup>
defineProps({payload:{type:Object,required:true},supervision:Object,practice:Boolean});
const name=(payload,prefix)=>[payload[`${prefix}_name_f`],payload[`${prefix}_name_m`],payload[`${prefix}_name_l`]].filter(Boolean).join(' ') || 'Not recorded';
const person=value=>`${[value.firstName,value.lastName].filter(Boolean).join(' ') || 'Not recorded'} · NPI ${value.npi || 'Not recorded'}`;
const address=(payload,prefix)=>['addr_1','addr_2','city','state','zip'].map(key=>payload[`${prefix}_${key}`]).filter(Boolean).join(', ') || 'Address not supplied';
const fields=value=>Object.entries(value).filter(([key])=>key!=='charge');
const display=value=>value==null?'Not supplied':typeof value==='object'?JSON.stringify(value):String(value);
</script>
<style scoped>
.submission-snapshot{padding:14px;border:1px solid #cbd8e5;border-radius:8px;margin:12px 0}summary{cursor:pointer;font-weight:650}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}dt{font-size:12px;color:#526477}dd{margin:5px 0;overflow-wrap:anywhere}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #dce4ee}
</style>
