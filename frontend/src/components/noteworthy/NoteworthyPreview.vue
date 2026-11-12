<template>
  <div class="nw-preview" aria-label="Interactive fictional payroll preview">
    <aside class="nw-preview-sidebar"><NoteworthyBrand light compact/><span class="nw-preview-practice">EVERGREEN THERAPY<br><small>Fictional practice</small></span><span class="nw-preview-active"><NoteworthyIcon name="calendar"/> Payroll</span><span><NoteworthyIcon name="document"/> Sessions & notes</span><span><NoteworthyIcon name="people"/> Team & rates</span><span><NoteworthyIcon name="layers"/> Pay statements</span><div class="nw-preview-sidebar-foot"><NoteworthyIcon name="shield"/> Built on Auricwell</div></aside>
    <div class="nw-preview-main"><div class="nw-preview-top"><div><p>YOUR PRACTICE, CONNECTED</p><h3>Payroll workspace</h3></div><span class="nw-badge nw-badge--mint">Demo data</span></div><p class="nw-preview-period">October 24 – November 6, 2026</p><div class="nw-preview-stats"><div><span class="nw-iconbox mint"><NoteworthyIcon name="check"/></span><span>Ready to review</span><strong>{{ money(total) }}</strong></div><div><span class="nw-iconbox purple"><NoteworthyIcon name="clock"/></span><span>Completed late note</span><strong>1 <small>found</small></strong></div><div><span class="nw-iconbox blue"><NoteworthyIcon name="people"/></span><span>Team members</span><strong>4</strong></div></div><div class="nw-preview-tabs" role="group" aria-label="Explore the payroll preview"><button v-for="item in tabs" :key="item.id" :aria-pressed="tab===item.id" @click="tab=item.id">{{ item.label }}</button></div>
      <div v-if="tab==='team'" class="nw-preview-table"><div class="nw-preview-table-head"><span>Team member</span><span>Service pay</span></div><button v-for="p in demoProviders" :key="p.id" @click="provider=p.id;tab='statement'"><span class="nw-preview-person"><i :class="p.color">{{ p.initials }}</i><span><strong>{{ p.name }}</strong><small>{{ p.credential }} · View statement →</small></span></span><strong>{{ money(providerTotal(state,p.id)) }}</strong></button></div>
      <div v-else-if="tab==='late'" class="nw-preview-note"><span class="nw-iconbox purple"><NoteworthyIcon name="document"/></span><span class="nw-badge nw-badge--mint">Finalized since last payroll</span><h4>A late note. A clear next step.</h4><p>Jordan’s October 22 session was unpaid last time. It’s ready to include now.</p><strong>{{ money(state.rates.jordan) }} <small>· Original service date preserved</small></strong><router-link to="/fundthred/noteworthy/demo" class="nw-text-link">Try adding it in the demo →</router-link></div>
      <div v-else class="nw-preview-statement"><label for="nw-preview-provider">Provider statement</label><select id="nw-preview-provider" v-model="provider"><option v-for="p in demoProviders" :key="p.id" :value="p.id">{{ p.name }}</option></select><div v-for="line in demoLines(state,provider)" :key="line.id"><span>{{ line.label }}<small>{{ line.date }} · {{ line.code }}</small></span><strong>{{ money(line.amount) }}</strong></div><footer><strong>Gross service pay</strong><strong>{{ money(providerTotal(state,provider)) }}</strong></footer></div>
      <div class="nw-preview-bottom"><span><span class="nw-live-dot"></span> Every decision has a next step.</span><router-link to="/fundthred/noteworthy/demo">Open guided demo <NoteworthyIcon name="arrow"/></router-link></div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import NoteworthyBrand from './NoteworthyBrand.vue';
import NoteworthyIcon from './NoteworthyIcon.vue';
import { createDemoState, demoLines, demoProviders, demoTotal, money, providerTotal } from '../../content/noteworthyPayroll';
const state={...createDemoState(),loaded:true,priorDecision:'payable',lateAdded:true,draftDecision:'payable',claimsApproved:true};
const total=computed(()=>demoTotal(state));
const tab=ref('team'),provider=ref('jordan');
const tabs=[{id:'team',label:'Team payroll'},{id:'late',label:'Late notes'},{id:'statement',label:'Provider view'}];
</script>
