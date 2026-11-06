<template>
  <section id="access-permissions" class="agency-access-card" :style="agencyCardStyle(selected?.agency, multiple)">
    <header><div><h3>Agency roles &amp; permissions</h3><p>Review access for one company. Changes here apply only to that company.</p></div></header>
    <p v-if="loading" role="status">Loading agency access…</p>
    <div v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></div>
    <template v-else>
      <label class="access-company">Company
        <select v-model="selectedId" :disabled="saving" @change="resetDraft">
          <option v-for="card in cards" :key="card.agency.id" :value="String(card.agency.id)">{{ card.agency.name }}</option>
        </select>
      </label>
      <p v-if="!cards.length">This person has no company affiliations. Assign the correct company before granting its permissions.</p>
      <template v-if="selected">
        <strong class="company-name" :style="{color:agencyCardColor(selected.agency)}">{{ selected.agency.name }}</strong>
        <p v-if="selected.agency.platformAccessOnly" class="access-note">Platform access only. This does not create an employment or clinical affiliation.</p>
        <p v-if="selected.access?.financialAccessOnly" class="access-note">Managed billing access only. This is not an employment or clinical affiliation.</p>
        <p v-if="selected.access?.legacyAccessOnly" class="access-note">Preserved tenant permission from before the transition. This is not an employment or clinical affiliation.</p>
        <p v-if="selected.access?.platformRole==='super_admin'" class="access-note">This person is a platform superadmin. Company working roles do not restrict their platform authority.</p>
        <div v-if="Number(selectedId)===1 && platform.eligible && platform.canEdit" class="access-modes">
          <button type="button" :aria-pressed="!platformMode" @click="setMode(false)">PlotTwistCo company access</button>
          <button type="button" :aria-pressed="platformMode" @click="setMode(true)">Platform defaults</button>
        </div>
        <template v-if="platformMode || selected.access">
          <p v-if="platformMode" class="access-note">Superadmins can select defaults for this PlotTwistCo employee across all platform companies. Each company can override them. Superadmin authority remains platform-wide.</p>
          <label v-if="platformMode" class="access-enable"><input v-model="draft.enabled" type="checkbox" :disabled="!canEdit || saving"/> Enable these platform defaults</label>
          <div v-if="platformMode && platform.serviceFields?.length" class="access-group">
            <h4>Platform services</h4><p class="access-note">These services belong to PlotTwistHQ. They do not grant superadmin authority.</p>
            <label v-for="field in platform.serviceFields" :key="field.key" class="access-enable"><input v-model="draft.platformServices[field.key]" type="checkbox" :disabled="!canEdit || saving"/>{{field.label}}</label>
          </div>
          <label class="access-row">{{ platformMode ? 'Default working role' : 'Working role at this company' }}
            <select v-model="draft.role" :disabled="!canEdit || saving">
              <option value="">{{ platformMode ? 'No platform role default' : inheritedRoleLabel }}</option>
              <option v-for="role in roles" :key="role" :value="role">{{ role.replaceAll('_',' ') }}</option>
            </select>
          </label>
          <p v-if="!platformMode" class="access-note">Current working role: {{ selected.access.role.replaceAll('_',' ') }} · {{ sourceLabel(selected.access.roleSource) }}</p>
          <div v-for="group in groups" :key="group" class="access-group">
            <h4>{{ group }}</h4>
            <label v-for="field in fields.filter(f=>f.group===group)" :key="field.key" class="access-row">
              <span>{{ field.label }}<small v-if="!platformMode">{{ selected.access.permissions[field.key] ? 'On' : 'Off' }} · {{ permissionSource(field.key) }}</small></span>
              <select v-model="draft.permissions[field.key]" :disabled="!canEdit || saving" :aria-label="field.label">
                <option value="inherit">{{ platformMode ? 'No platform default' : 'Inherit / preserve' }}</option>
                <option value="on">On</option><option value="off">Off</option>
              </select>
            </label>
          </div>
          <p v-if="!canEdit" class="access-note">Only an administrator for this company or a superadmin can change its permissions. Only superadmins can select platform defaults.</p>
          <div v-else class="access-actions"><button type="button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : platformMode ? 'Save platform defaults' : `Save ${selected.agency.name} access` }}</button><button type="button" :disabled="saving" @click="resetDraft">Cancel changes</button></div>
          <p v-if="notice" role="status">{{ notice }}</p>
        </template>
        <p v-else>This affiliation is inactive. Its saved permissions remain preserved.</p>
      </template>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import { agencyCardColor, agencyCardStyle } from '../../../utils/agencyCardScope.js';
const props=defineProps({userId:{type:[Number,String],required:true},agencyId:{type:[Number,String],default:0}});
const loading=ref(true),saving=ref(false),error=ref(''),notice=ref(''),cards=ref([]),fields=ref([]),roles=ref([]),platform=ref({}),selectedId=ref(''),platformMode=ref(false),draft=ref({permissions:{},platformServices:{}});
const selected=computed(()=>cards.value.find(c=>Number(c.agency.id)===Number(selectedId.value)));
const multiple=computed(()=>cards.value.filter(c=>c.access?.membership || c.agency.membership_active!==undefined).length>1);
const groups=computed(()=>[...new Set(fields.value.map(f=>f.group))]);
const canEdit=computed(()=>platformMode.value?platform.value.canEdit:selected.value?.canEdit);
const inheritedRoleLabel=computed(()=>selected.value?.access?.platformDefaults?.role ? `Platform default: ${selected.value.access.platformDefaults.role.replaceAll('_',' ')}` : 'Preserve existing company role');
const sourceLabel=source=>({platform_default:'Platform default',agency_override:'Company override',agency_role:'Company role',preserved_agency_access:'Preserved company access',managed_billing:'Managed billing relationship'})[source]||'';
function permissionSource(key){const access=selected.value?.access;if(!access)return'';let label=sourceLabel(access.sources[key]);const defaults=access.platformDefaults?.permissions_json||{};if(access.sources[key]==='agency_override'&&Object.hasOwn(defaults,key))label+=` (platform default: ${defaults[key]?'On':'Off'})`;return label;}
function setMode(value){platformMode.value=value;resetDraft();}
function resetDraft(){notice.value='';if(Number(selectedId.value)!==1)platformMode.value=false;const access=platformMode.value?platform.value.defaults:selected.value?.access;const values=platformMode.value?access?.permissions_json:access?.overrides;draft.value={platformServices:Object.fromEntries((platform.value.serviceFields||[]).map(f=>[f.key,[true,1,'1'].includes(platform.value.services?.[f.key])])),enabled:!!access?.enabled,role:platformMode.value?access?.role||'':access?.roleOverride||'',permissions:Object.fromEntries(fields.value.map(f=>[f.key,values&&Object.hasOwn(values,f.key)?values[f.key]?'on':'off':'inherit']))};}
async function load(){if(!props.userId)return;loading.value=true;error.value='';try{const{data}=await api.get(`/users/${props.userId}/agency-access`,{skipGlobalLoading:true});cards.value=data.cards||[];fields.value=data.fields||[];roles.value=data.roles||[];platform.value=data.platform||{};if(!cards.value.some(c=>String(c.agency.id)===selectedId.value))selectedId.value=String(cards.value.find(c=>Number(c.agency.id)===Number(props.agencyId))?.agency.id||cards.value[0]?.agency.id||'');resetDraft();}catch(e){error.value=e.response?.data?.error?.message||'Could not load agency permissions.';}finally{loading.value=false;}}
async function save(){if(!canEdit.value||!selected.value)return;saving.value=true;error.value='';const companyName=selected.value.agency.name;try{const current=platformMode.value?platform.value.defaults:selected.value.access;const body={role:draft.value.role||null,revision:current.revision,permissions:Object.fromEntries(Object.entries(draft.value.permissions).map(([key,value])=>[key,value==='inherit'?null:value==='on']))};if(platformMode.value){body.enabled=draft.value.enabled;if((platform.value.serviceFields||[]).length)body.platformServices=draft.value.platformServices;}await api.put(platformMode.value?`/users/${props.userId}/platform-access-defaults`:`/users/${props.userId}/agency-access/${selectedId.value}`,body);await load();notice.value=platformMode.value?'Platform defaults saved. Company overrides remain in place.':`${companyName} access saved.`;}catch(e){error.value=e.response?.data?.error?.message||'Could not save access. Refresh and try again.';}finally{saving.value=false;}}
watch(()=>[props.userId,props.agencyId],()=>{selectedId.value='';platformMode.value=false;load();},{immediate:true});
</script>
<style scoped>
.agency-access-card{background:white;border:1px solid #dde2e8;border-radius:18px;padding:24px;margin-bottom:20px;color:#142031}.agency-access-card h3{margin:0 0 8px;font-size:22px}.agency-access-card header p,.access-note{color:#647184;font-size:14px;line-height:1.5}.access-company{display:flex;align-items:center;gap:16px;margin:18px 0;font-weight:600}.access-company select{flex:1}.company-name{display:block;font-size:18px;margin:12px 0}.access-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #edf0f3}.access-row small{display:block;color:#647184;font-size:12px;margin-top:5px}.access-row select{width:210px;max-width:50%}.agency-access-card select{padding:9px;border:1px solid #c9d2de;border-radius:8px;background:white;font:inherit;color:inherit}.access-group h4{margin:24px 0 4px;color:#466154}.access-actions,.access-modes{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.agency-access-card button{padding:10px 14px;border:1px solid #ccd7d0;border-radius:8px;background:#edf6f0;color:#1e5336;font:inherit;cursor:pointer}.access-actions button:first-child{background:#5d9275;color:white}.access-modes button[aria-pressed=true]{border-color:#438761;background:#dceddf}.access-enable{display:flex;gap:10px;align-items:center;padding:12px 0}.agency-access-card :disabled{opacity:.65;cursor:default}.agency-access-card [role=alert]{color:#ac2626}@media(max-width:600px){.agency-access-card{padding:16px}.access-row{align-items:flex-start}.access-row select{width:135px}.access-company{flex-direction:column;align-items:stretch}}
</style>
