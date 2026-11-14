<script setup>
import {ref} from 'vue';
import api from '../../services/api.js';
const props=defineProps({agencyId:[Number,String],terms:String,termsVersion:String});
const emit=defineEmits(['saved']);
const name=ref(''),number=ref(''),scenario=ref('success'),accepted=ref(false),busy=ref(false),error=ref('');
const requestKey=`qa-card:${crypto.randomUUID()}`;
async function save(){
 if(busy.value)return;error.value='';
 if(number.value.replace(/\s/g,'')!=='0000000000000000'){error.value='Enter sixteen zeros for this QA simulation. Do not use a real card.';return;}
 if(!accepted.value||!name.value.trim()){error.value='Review the authorization and enter your own QA name before saving.';return;}
 busy.value=true;
 try{await api.post('/qa-payments/cards',{agencyId:Number(props.agencyId),testCard:number.value,scenario:scenario.value,requestKey,name:name.value.trim(),consent:{accepted:true,version:props.termsVersion,signatureName:name.value.trim()}});emit('saved');}
 catch(e){error.value=e.response?.data?.error?.message||'The simulated card could not be saved.';}
 finally{busy.value=false;}
}
</script>
<template>
 <form class="qa-card" @submit.prevent="save">
  <h4>QA test card</h4><p>This simulated card exercises the app’s payment flow. No card or bank account is contacted.</p>
  <label>Your QA name<input v-model="name" required maxlength="255" :disabled="busy" /></label>
  <label>Test card — sixteen zeros<input v-model="number" inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 0000 0000" :disabled="busy" required /></label>
  <label>Payment behavior<select v-model="scenario" :disabled="busy"><option value="success">Success</option><option value="decline">Decline</option><option value="processing">Pending / processing</option></select></label>
  <details><summary>Review the financial authorization</summary><p>{{terms}}</p></details>
  <label class="check"><input v-model="accepted" type="checkbox" :disabled="busy" required /> I have read and accept this authorization for my synthetic QA account.</label>
  <p v-if="error" role="alert">{{error}}</p><button type="submit" :disabled="busy||!accepted">{{busy?'Saving…':'Save simulated card'}}</button>
 </form>
</template>
<style scoped>.qa-card{padding:18px;border:2px solid #8c641e;border-radius:10px;background:#fff9e8;color:#503b16}.qa-card label{display:grid;gap:8px;margin:14px 0}.qa-card input:not([type=checkbox]),.qa-card select{width:100%;min-height:44px;box-sizing:border-box;padding:10px;font:inherit}.qa-card .check{display:flex;align-items:flex-start;line-height:1.6}.qa-card .check input{flex:none;margin-top:6px}.qa-card p{line-height:1.65}.qa-card button{min-height:44px;padding:10px 16px}</style>
