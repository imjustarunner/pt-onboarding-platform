<template>
  <dialog ref="dialog" class="recipient-preview" aria-labelledby="recipient-preview-title" @cancel.prevent="$emit('close')">
    <header>
      <div><small>Recipient preview{{ recipient?.name ? ' · ' + recipient.name : '' }}</small><h3 id="recipient-preview-title">{{ item.title }}</h3></div>
      <button type="button" autofocus @click="$emit('close')">Close preview</button>
    </header>
    <nav v-if="items.length > 1" aria-label="Preview selected items">
      <button type="button" :disabled="position === 0" @click="position--">Previous</button>
      <span>{{ position + 1 }} of {{ items.length }}</span>
      <button type="button" :disabled="position === items.length - 1" @click="position++">Next</button>
    </nav>
    <main aria-live="polite">
      <p v-if="loading" role="status">Loading preview…</p>
      <div v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></div>
      <section v-else-if="notice">
        <h4>{{ notice.subject }}</h4>
        <iframe title="Email notice preview" sandbox="" referrerpolicy="no-referrer" :srcdoc="notice.html" />
        <p>Final delivery follows this account’s contact choices and the agency’s email settings.</p>
      </section>
      <SmartSchoolRoiFlow v-else-if="smart && item.id === 'smart-school-roi'" :key="item.id" :roi-context="smart" :locale="smart.locale"
        :link="{language_code:smart.locale}" :bound-client="smart.client" public-key="" session-token="" preview-only />
      <SmartDisclosureFlow v-else-if="smart" :key="item.id" :disclosure-context="smart" :locale="smart.locale"
        :bound-client="smart.client" public-key="" preview-only />
      <fieldset v-else-if="plan" disabled>
        <SafetyPlanDocument :model-value="plan.data" :template="plan.template" :branding="plan.branding || branding" :version="plan.version" :editable="editableForm" />
        <div v-if="plan.template.key !== 'attendance-verification'" inert @submit.capture.stop.prevent>
          <SafetyPlanSigning :plan="plan" :signer="{name:recipient?.name || ''}" portal />
        </div>
      </fieldset>
      <iframe v-else-if="pdf" :src="pdf" :title="item.title"></iframe>
      <section v-else-if="item.group === 'documents'" class="document-text"><div v-if="html" v-html="html"></div><p v-else>The template has no previewable text.</p></section>
      <section v-else-if="assessment">
        <p>{{ assessment.description }}</p>
        <article v-for="section in assessment.domains || assessment.categories || assessment.values || []" :key="section.key">
          <h4>{{ section.label }}</h4><p>{{ section.definition || section.description }}</p>
          <p v-if="section.primaryQuestion">{{ section.primaryQuestion }}</p><p v-if="section.reflectionPrompt">{{ section.reflectionPrompt }}</p>
          <p v-if="section.desiredEmphasisQuestion">{{ section.desiredEmphasisQuestion }}</p>
          <p v-for="question in questionText(section.questions)" :key="question">{{ question }}</p>
        </article>
      </section>
      <section v-else><p>{{ item.detail }}</p><p v-if="terms">{{ terms }}</p>
        <p v-if="payment && !recipient">Choose a portal recipient to preview their authorization terms.</p>
        <fieldset disabled>
          <label v-if="terms">Signer name <input :placeholder="recipient?.name" /></label>
          <template v-if="item.id==='insurance'"><label>Front of card <input type="file" /></label><label>Back of card <input type="file" /></label></template>
          <template v-if="item.id==='information'">
            <div class="preview-fields">
              <label v-for="[key,label] in Object.entries(step.fields || {}).filter(([key])=>key!=='grade')" :key="key">{{ label }}
                <input :type="key==='date_of_birth'?'date':'text'" />
              </label>
            </div>
          </template>
          <template v-if="item.id==='notifications'">
            <label v-for="category in step.categories" :key="category.key">{{ category.label }}
              <small>{{ category.detail }}</small>
              <select><option value="">Choose a channel</option><option>Email</option><option>Text</option><option>Both</option><option>Off</option></select>
            </label>
          </template>
          <template v-if="item.id==='plan'"><p>The portal shows the plan shared with this recipient when it is ready for review.</p>
            <label><input type="checkbox" /> I have reviewed this plan and agree to sign electronically.</label>
            <label>Full name for your signature <input /></label>
          </template>
          <p v-if="item.id==='payment' && recipient?.cardAllowed !== false">After accepting the payment authorization, the payer selects an eligible saved card or opens Stripe’s secure card form if a card is required.</p>
          <label v-if="item.id==='information'"><input type="checkbox" /> I reviewed this information. It is correct, or I submitted the needed corrections.</label>
        </fieldset>
      </section>
    </main>
    <footer>Read-only preview · Nothing is sent or signed here.</footer>
  </dialog>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import {prepareEmailPreview} from '../../utils/emailPreview';
import SafetyPlanDocument from '../safetyPlans/SafetyPlanDocument.vue';
import SafetyPlanSigning from '../safetyPlans/SafetyPlanSigning.vue';
import SmartSchoolRoiFlow from '../public/SmartSchoolRoiFlow.vue';
import SmartDisclosureFlow from '../public/SmartDisclosureFlow.vue';
const props = defineProps({items:{type:Array,required:true},clientId:[Number,String],agencyId:[Number,String],clientName:String,recipient:Object,context:Object,branding:Object,action:String,releaseContact:Object});
const emit = defineEmits(['close','reviewed']);
const position=ref(0), dialog=ref(null), loading=ref(false), error=ref('');
const notice=ref(null), smart=ref(null), plan=ref(null), assessment=ref(null), html=ref(''), terms=ref(''), pdf=ref(''), step=ref({});
const item=computed(()=>props.items[position.value]);
const payment=computed(()=>item.value?.group==='portalSteps' && ['authorization','payment'].includes(item.value.id));
const editableForm=computed(()=>item.value?.group==='release' || props.action==='complete' && ['safety-plan','release-of-information','client-information-update','enrollment-document'].includes(plan.value?.template.key));
let sequence=0;
function clear(){
  if(pdf.value)URL.revokeObjectURL(pdf.value);
  pdf.value='';notice.value=null;smart.value=null;plan.value=null;assessment.value=null;html.value='';terms.value='';step.value={};
}
function questionText(questions){
  return Object.values(questions || {}).flat().map(q=>typeof q==='string'?q:q?.text || q?.prompt).filter(Boolean);
}
async function load(){
  const run=++sequence, selected=item.value;
  clear();error.value='';loading.value=true;
  try{
    const base='/clients/'+props.clientId+'/updates/preview/';
    if(selected.group==='notice'){
      const {data}=await api.get(base+'email/notice',{params:{recipientId:props.recipient?.id}});
      if(run===sequence)notice.value={subject:data.subject,html:prepareEmailPreview(data.html).html};
    }else if(selected.group==='smart'){
      const {data}=await api.get(base+'smart/'+selected.id,{params:{locale:props.context?.locale || 'en'}});
      if(run===sequence){
        smart.value=data.context;
        if(data.context?.contentHash)emit('reviewed',{key:selected.id,locale:props.context?.locale || 'en',contentHash:data.context.contentHash});
      }
    }else if(selected.group==='release'){
      const {data}=await api.get('/clinical-forms/template',{params:{documentKey:selected.id,clientId:props.clientId,agencyId:props.agencyId}});
      if(run===sequence)plan.value={template:data.template,branding:data.branding,version:1,data:{
        personLabel:props.clientName,planDate:new Date().toLocaleDateString('en-CA'),
        recipientName:props.releaseContact?.fullName || '',recipientEmail:props.releaseContact?.email || '',recipientPhone:props.releaseContact?.phone || ''
      }};
    }else if(selected.group==='foundation'){
      const {data}=await api.get('/enrollment-portal/clients/'+props.clientId+'/preview/'+encodeURIComponent(selected.id),{params:{...props.context,agencyId:props.agencyId}});
      if(run===sequence)plan.value={template:data,version:1,data:{personLabel:props.clientName,planDate:new Date().toLocaleDateString('en-CA')}};
    }else if(selected.group==='records'){
      const {data}=await api.get('/clinical-forms/'+selected.id,{params:{version:selected.version}});
      if(run!==sequence)return;
      if(Number(data.clientId)!==Number(props.clientId))throw new Error('Document unavailable');
      plan.value=data;
    }else if(selected.group==='documents'){
      const {data}=await api.get(base+'document/'+selected.id,{responseType:'blob'});
      if(run!==sequence)return;
      if(data.type==='application/pdf')pdf.value=URL.createObjectURL(data);
      else {
        const template=JSON.parse(await data.text());
        if(run===sequence)html.value=DOMPurify.sanitize(template.html || '',{FORBID_TAGS:['form','input','button','iframe','style','object','svg','img','video','audio','link'],FORBID_ATTR:['style','href','src']});
      }
    }else if(selected.group==='assessments'){
      const {data}=await api.get(base+'assessment/'+encodeURIComponent(selected.id));
      if(run===sequence)assessment.value=data;
    }else if(selected.group==='portalSteps' && ['information','notifications'].includes(selected.id)){
      const {data}=await api.get(base+'portalSteps/'+selected.id);
      if(run===sequence)step.value=data;
    }else if(payment.value && props.recipient){
      const {data}=await api.get(base+'portalSteps/'+selected.id,{params:{recipientId:props.recipient.id}});
      if(run===sequence)terms.value=data.terms;
    }
  }catch(e){if(run===sequence)error.value=e.response?.data?.error?.message || 'This preview could not be loaded.';}
  finally{if(run===sequence)loading.value=false;}
}
watch(()=>[item.value,props.clientId,props.recipient?.id,props.context?.channel,props.context?.locale,props.context?.audience,props.context?.service,props.releaseContact?.id],load,{immediate:true});
onMounted(()=>dialog.value?.showModal?.());
onBeforeUnmount(()=>{sequence++;clear();});
</script>
<style scoped>
.recipient-preview{box-sizing:border-box;width:min(820px,94vw);max-height:90dvh;padding:0;color:#19334f;border:1px solid #c5d3e1;border-top:4px solid #bb9653;border-radius:14px;background:white;box-shadow:0 18px 70px #10244438}
.recipient-preview::backdrop{background:#0e213663}header,nav,footer{padding:15px 22px;border-bottom:1px solid #dbe3ec}header,nav{display:flex;align-items:center;justify-content:space-between;gap:12px}h3{margin:5px 0}main{padding:20px;overflow:auto;max-height:60dvh}article{border-top:1px solid #dce3eb;padding:10px 0}p{line-height:1.6}button{font:inherit;border:1px solid #c1d0df;border-radius:7px;background:white;color:#16395d;padding:8px 13px;cursor:pointer}.preview-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.preview-fields input,fieldset small{display:block}fieldset{min-width:0;margin:0;padding:0;border:0}fieldset label{display:block;margin:8px 0}footer,small{color:#546579;font-size:.85rem}iframe{width:100%;height:55dvh;border:0}
</style>
