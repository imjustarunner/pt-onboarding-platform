<template>
 <article class="provider-card">
  <div class="card-top"><button class="portrait" :aria-label="`Enlarge photo of ${provider.firstName} ${provider.lastName}`" @click="$emit('photo',provider)"><img v-if="photoUrl&&!photoFailed" :src="photoUrl" alt="" @error="photoFailed=true"/><span v-else>{{initials}}</span></button><span class="status">{{mode==='current'?(provider.currentSlot?.checkedIn?'Checked in':'Your appointment'):mode==='today'?'Here today':'Provider'}}</span></div>
  <button class="profile-link" @click="$emit('profile',provider)"><strong>{{provider.firstName}} {{provider.lastName}}</strong><span class="credential">{{provider.credential||provider.title||'Provider'}}</span></button>
  <div class="agency"><img v-if="logoUrl&&!logoFailed" :src="logoUrl" alt="" @error="logoFailed=true"/><span>{{provider.agencyName}}</span>
  <span v-if="mode!=='profiles'" class="room"><MapPin :size="15"/>{{provider.currentRoomNumber?`Office ${provider.currentRoomNumber}`:provider.currentRoomName||'Office visit'}}</span></div>
  <button :disabled="mode==='current' && provider.currentSlot?.checkedIn" class="choose" :class="{checkin:mode==='current'}" @click="$emit('select',provider)"><span>{{mode==='current'?`${formatKioskTime(provider.currentSlot?.startAt)} · ${provider.currentSlot?.checkedIn?'Checked in':'Check in'}`:mode==='today'?'More info · Today’s times':'View profile'}}</span><ArrowRight :size="19" aria-hidden="true"/></button>
 </article>
</template>
<script setup>
import {computed,ref} from 'vue';
import {ArrowRight,MapPin} from '@lucide/vue';
import {toUploadsUrl} from '../../utils/uploadsUrl';
import {tenantFaviconUrl} from '../../utils/tenantBrandAssets';
import {formatKioskTime} from '../../utils/kioskTime';
const props=defineProps({provider:{type:Object,required:true},mode:{type:String,default:'current'}});defineEmits(['select','photo','profile']);
const photoFailed=ref(false),logoFailed=ref(false);
const photoUrl=computed(()=>toUploadsUrl(props.provider.profilePhotoPath)),logoUrl=computed(()=>toUploadsUrl(props.provider.agencyLogoPath)||tenantFaviconUrl(props.provider.agencySlug));
const initials=computed(()=>`${props.provider.firstName?.[0]||''}${props.provider.lastName?.[0]||''}`);
</script>
<style scoped>
.provider-card{display:flex;flex-direction:column;padding:22px;background:#fffefa;border:1px solid #dde5d8;border-radius:22px;color:#24443d;min-width:0;box-shadow:0 4px 18px #203f3b04}.card-top{display:flex;justify-content:space-between;align-items:start;gap:8px}.portrait{width:76px;height:88px;padding:0;background:#e7eddc;border:0;border-radius:15px;overflow:hidden;cursor:pointer;flex-shrink:0}.portrait img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}.portrait span{font-size:25px}.status{font-size:10px;border-radius:20px;background:#eaf2e5;color:#456543;padding:7px 9px}.profile-link{padding:0;margin:16px 0 9px;border:0;background:none;text-align:left;color:inherit;cursor:pointer}.profile-link strong{display:inline;font-size:21px;letter-spacing:-.5px}.profile-link span{display:inline;margin-left:7px;font-size:13px;color:#728071;margin-top:5px}.agency{display:flex;flex-wrap:wrap;align-items:center;gap:9px;font-size:12px;color:#718071;min-height:30px;margin:2px 0 14px}.agency img{max-width:52px;height:28px;object-fit:contain}.room{display:flex;gap:7px;align-items:center;font-size:12px;margin-left:auto;color:#697b69}.choose{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin-top:auto;border:1px solid #dbe4d6;background:transparent;border-radius:11px;padding:14px 12px;color:#24443d;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.choose.checkin{background:#315e49;color:#fff;border-color:#315e49}button:focus-visible{outline:3px solid #b78432;outline-offset:3px}@media(max-width:450px){.provider-card{padding:17px}.profile-link strong{font-size:19px}}
.choose:disabled{background:#e5eee1;color:#42643f;border-color:#cadfc2;cursor:default}
</style>
