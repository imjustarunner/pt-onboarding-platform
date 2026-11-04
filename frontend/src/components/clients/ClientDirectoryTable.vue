<template>
  <div class="client-directory-table"><table><thead><tr><th>Client</th><th>Agency & affiliations</th><th>Care team</th><th>Care snapshot</th><th>Next booked visit</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>
    <tr v-for="client in clients" :key="client.id" @mouseenter="$emit('preview',client)" @mouseleave="$emit('leave')" @focusin="$emit('preview',client)" @focusout="$emit('leave')" @click="$emit('pin',client)">
      <td data-label="Client"><div class="client-identity"><span class="client-avatar" aria-hidden="true">{{initials(client)}}</span><div><RouterLink :to="chartLink(client)" @click.stop>{{client.full_name||client.initials}}</RouterLink><p v-if="client.age||client.pronouns">{{[client.age?`${client.age} years`:null,client.pronouns].filter(Boolean).join(' · ')}}</p><p>{{client.status_label||client.status||'Status not recorded'}}</p></div></div></td>
      <td data-label="Agency & affiliations"><OrganizationBadge :name="client.agency_name" :icon="client.agency_icon"/><div v-for="org in client.affiliations||[]" :key="org.id" class="affiliation"><OrganizationBadge :name="org.name" :icon="org.icon_file_path"/></div></td>
      <td data-label="Care team"><strong>{{client.provider_name||'Not recorded'}}</strong><p>{{client.client_type||client.service||''}}</p><p v-if="client.frequency">{{client.frequency}}</p></td>
      <td data-label="Care snapshot"><span v-if="client.focus">{{client.focus}}</span><p>{{client.consent||client.paperwork_status_label||'Paperwork status not recorded'}}</p></td>
      <td data-label="Next booked visit">{{clientVisitLabel(client,timeZone)}}</td>
      <td class="client-actions" @click.stop><button type="button" :aria-label="`Pin preview for ${client.full_name||client.initials}`" @click="$emit('pin',client)">Pin preview</button><RouterLink :to="chartLink(client)">Open chart →</RouterLink></td>
    </tr>
  </tbody></table></div>
</template>
<script setup>
import {clientVisitLabel} from './clientVisit';
import OrganizationBadge from './OrganizationBadge.vue';
const props=defineProps({clients:{type:Array,default:()=>[]},chartLink:{type:Function,required:true},timeZone:{type:String,default:'America/Denver'}});
defineEmits(['preview','leave','pin']);
const initials=c=>c.initials||String(c.full_name||'').split(/\s+/).map(n=>n[0]).slice(0,2).join('');
</script>
<style scoped>
.client-directory-table{border:1px solid #dce6f2;border-radius:12px;background:white;overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th{font-size:12px;color:#61758c;background:#f7faff}td,th{padding:18px 16px;border-bottom:1px solid #e6edf5;vertical-align:top}tbody tr:hover{background:#f6faff}td{font-size:13px;color:#233b57}td p{font-size:12px;color:#60768e;margin:6px 0 0}.client-identity{display:flex;align-items:center;gap:12px}.client-identity a{font-weight:650;text-decoration:none}.client-avatar{display:grid;place-items:center;width:38px;height:42px;background:#e9f1fc;border-radius:10px;color:#23578b;flex:none;font-weight:600}.affiliation{margin-top:8px}.client-actions button{background:#edf4fc;color:#245888;border:1px solid #c6d8eb;border-radius:7px;padding:8px 10px;cursor:pointer}.client-actions a{display:block;margin-top:10px;white-space:nowrap;font-size:12px}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:900px){table,tbody,tr,td{display:block}thead{display:none}tr{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}td{padding:0;border:0;min-width:0}td:first-child{grid-column:1/-1}td:not(:first-child):before{content:attr(data-label);display:block;font-size:10px;color:#6b7f96;margin-bottom:7px}tr+tr{border-top:1px solid #dce6f2}}@media(max-width:500px){tr{grid-template-columns:1fr}.client-actions{display:flex;align-items:center;gap:16px}.client-actions a{margin:0}}
</style>
