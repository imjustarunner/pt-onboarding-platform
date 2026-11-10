<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { LockKeyhole, UserRound, Fingerprint, Bell, ArrowRight, LogOut } from '@lucide/vue';
import AuricWellBrand from '../components/auricwell/AuricWellBrand.vue';
import {activateClinicalRecovery,clearClinicalRecovery} from './clinicalRecovery.js';
import {activateFamilyDevice,clearFamilyDevice} from './familyContext.js';
const AccountSecurityPanel=defineAsyncComponent(()=>import('../components/AccountSecurityPanel.vue'));
const MobileNotifications=defineAsyncComponent(()=>import('./MobileNotifications.vue'));
const notificationPanel=ref(false),notificationSettings=ref(false),notificationUnread=ref(0);
const MobileFamilyPortal=defineAsyncComponent(()=>import('./MobileFamilyPortal.vue'));
import QuickView from '../views/QuickViewAccessView.vue';
import { MobileDevice, native, apiOrigin, mobileApi, quickApiBase, randomSecret, pkceChallenge, accountUrl, mobileRequestError } from './transport.js';

const route=useRoute(),router=useRouter();
const screen=ref('loading'),busy=ref(false),error=ref(''),username=ref(''),organizationChoices=ref([]),passcode=ref(''),confirmCode=ref('');
const access=ref(null),profile=ref(null),workspace=ref(null),accountOpen=ref(false),connectAccount=ref(null),connectVerification=ref(null),selectedAgency=ref('');
const qv=ref(null),notificationStatus=ref(''),biometry=ref(false),accountLoading=ref(false);
const appLock=ref({method:'none',hasCode:false}),lockChoice=ref('none'),newCode=ref(''),newCodeConfirm=ref(''),lockNotice=ref(''),privacyIntro=ref(false);
let wasBackground=false;
let generation=0,interceptor,deviceListener,pushListener,privacyListener,notificationTimer;
const accountLink=computed(()=>accountUrl(profile.value?.workspace));
const securityLink=computed(()=>accountUrl(profile.value?.workspace,'account-security'));
const preferencesLink=computed(()=>accountUrl(profile.value?.workspace,'preferences'));
const connectQuery=()=>Object.fromEntries(new URLSearchParams(window.location.search));
async function refreshNotificationCount(){const token=access.value?.sessionToken;if(!token||screen.value!=='workspace'||profile.value?.surface==='family')return;try{const data=await notificationRequest('GET','/notification-feed?status=unread&page=1');if(access.value?.sessionToken===token)notificationUnread.value=Number(data.unreadCount||0);}catch{/* The inbox retains its own retry control. */}}
watch(()=>access.value?.sessionToken,()=>{notificationUnread.value=0;void refreshNotificationCount();});
async function notificationRequest(method,path,data={}){try{return (await mobileApi.request({method,url:path,...(method==='GET'?{}:{data}),headers:{'X-Quick-View-Session':access.value?.sessionToken || ''}})).data;}catch(error){if([401,423].includes(error.response?.status))lock();throw error;}}
async function openNotificationEmail(item){notificationPanel.value=false;await router.push({path:'/mobile/workspace',query:{view:'home',conversationId:String(item.related_entity_id)}});await nextTick();qv.value?.openDeepLink();}
async function deviceRequest(method,path,data={}) {
  if(native)return MobileDevice.request({method,path,data,sessionToken:access.value?.sessionToken || ''});
  return (await mobileApi.request({method,url:path,data,headers:access.value?{'X-Quick-View-Session':access.value.sessionToken}:{}})).data;
}
function applySession(result) {
  notificationPanel.value=false;
  clearFamilyDevice();if(result.profile?.surface==='family')activateFamilyDevice({sessionToken:result.sessionToken,apiOrigin,onLocked:lock});
  activateClinicalRecovery(result.userId || result.profile?.user?.id,result.agencyId || result.profile?.workspace?.id);
  const notifications=profile.value?.user?.id===result.profile.user?.id?profile.value.notifications:null;
  access.value=result;profile.value={...result.profile,...(notifications?{notifications}:{})};workspace.value=result.profile.workspace;
  appLock.value=result.profile.appLock || {method:'code',hasCode:true};lockChoice.value=appLock.value.method;
  passcode.value='';confirmCode.value='';screen.value='workspace';
}
async function normalizeWorkspaceRoute() {
  if(profile.value?.surface==='family'){const slug=profile.value.workspace?.portal_url || 'family';if(!route.path.startsWith('/mobile/family/'))await router.replace({path:`/mobile/family/${encodeURIComponent(slug)}/guardian`,query:{panel:'family'}});return;}
  if(route.path==='/mobile/workspace')return;
  const query={...route.query};
  await router.replace({path:'/mobile/workspace',query:{view:'home'}});
  if(query.conversationId || query.threadId || query.kind)await router.push({path:'/mobile/workspace',query:Object.fromEntries(Object.entries(query).filter(([key])=>['conversationId','threadId','parentId','messageId','secure','kind','id','suite','view'].includes(key)))});
}
async function detectSession() {
  const current=++generation;screen.value='loading';error.value='';
  try {
    const status=await deviceRequest('GET','/session');if(current!==generation)return false;
    workspace.value=status.workspace;appLock.value=status.appLock || {method:'code',hasCode:!status.needsCode};
    if(appLock.value.method==='none'){
      const result=await deviceRequest('POST','/resume');if(current!==generation)return false;applySession(result);await normalizeWorkspaceRoute();await afterOpen();
    }else screen.value='locked';
    return true;
  }catch(e){if(current!==generation)return false;screen.value='signin';if(e.response?.status!==401)error.value=mobileRequestError(e);return false;}
}
async function startSignIn() {
  busy.value=true;error.value='';
  try {
    const name=username.value.trim();if(!name)throw new Error('Enter your username or email.');
    const {data:identity}=await axios.post(`${apiOrigin}/api/auth/identify`,{username:name,surface:'schoolcarebridge',...(selectedAgency.value?{organizationSlug:selectedAgency.value}:{})});
    if(identity.needsOrgChoice){organizationChoices.value=identity.orgOptions || [];return;}
    const org=identity.resolvedOrg,slug=org?.portal_url || org?.slug;
    const {data:tenant}=slug?await axios.get(`${quickApiBase}/tenant`,{params:{portal:slug}}):{data:{loginUrl:'https://auricwell.com/login'}};
    const verifier=randomSecret(),state=randomSecret(),challenge=await pkceChallenge(verifier);
    const callback=native?'com.auricwell.mobile://auth':'https://auricwell.com/mobile/callback';
    const url=new URL('/mobile/connect',tenant.loginUrl);
    url.search=new URLSearchParams({clientId:native?'ios':'web',redirectUri:callback,challenge,state,username:name,loginPath:new URL(tenant.loginUrl).pathname}).toString();
    if(native){
      const {url:callbackUrl}=await MobileDevice.signIn({url:url.href});
      await completeSignIn(callbackUrl,{state,verifier,callback,clientId:'ios'});
    } else {
      sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state,verifier,callback,clientId:'web',createdAt:Date.now()}));
      window.location.replace(url.href);
    }
  } catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function loadConnect() {
  screen.value='connect';busy.value=true;error.value='';connectAccount.value=null;connectVerification.value=null;selectedAgency.value='';
  const query=connectQuery();
  if(query.clientId==='web' && performance.getEntriesByType?.('navigation')?.[0]?.type==='back_forward'){location.replace('https://auricwell.com/mobile');return;}
  try {
    if(!['web','ios'].includes(query.clientId) || !/^[\w-]{43}$/.test(query.challenge || '') || !/^[\w-]{43}$/.test(query.state || ''))throw new Error('Restart sign-in from Auricwell mobile.');
    const {data}=await mobileApi.get('/account',{params:{username:query.username || undefined}});connectAccount.value=data;selectedAgency.value=String(data.agencies[0]?.id || '');
  } catch(e) {
    if([401,423].includes(e.response?.status)){
      const path=query.loginPath;
      if(!/^\/(?:[a-z0-9-]+\/)*login\/?$/i.test(path || '')){error.value='Restart sign-in from Auricwell mobile.';return;}
      const login=new URL(path,location.origin);login.searchParams.set('redirect',location.pathname+location.search);if(query.username)login.searchParams.set('u',query.username);login.searchParams.set('mobile','1');location.replace(login.href);
    }else if(e.response?.data?.error?.code==='MFA_REQUIRED'){
      try{
        const {data:user}=await axios.get('/api/users/me',{withCredentials:true});
        if(!user?.id)throw new Error('Sign in again to verify your account.');
        const {useAuthStore}=await import('../store/auth.js');useAuthStore().user=user;
        connectVerification.value={name:[user.first_name,user.last_name].filter(Boolean).join(' '),email:user.email};
      }catch(verificationError){error.value=mobileRequestError(verificationError);}
    } else error.value=mobileRequestError(e);
  } finally {busy.value=false;}
}
async function authorize() {
  busy.value=true;error.value='';
  try {
    const query=connectQuery();
    const {data}=await mobileApi.post('/authorize',{...query,agencyId:Number(selectedAgency.value),expectedUserId:connectAccount.value.user.id});
    const callback=new URL(data.redirectUri);callback.search=new URLSearchParams({code:data.code,state:query.state}).toString();
    location.replace(callback.href);
  } catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function completeSignIn(url,pending) {
  const callback=new URL(url),code=callback.searchParams.get('code');
  if(!pending || pending.state!==callback.searchParams.get('state') || !code || pending.createdAt && Date.now()-pending.createdAt>600000)throw new Error('The sign-in request expired. Start again from this device.');
  const data={code,verifier:pending.verifier,clientId:pending.clientId,redirectUri:pending.callback,deviceName:native?'Auricwell iPhone':'Auricwell browser'};
  const result=native?await MobileDevice.exchange({data}):(await mobileApi.post('/exchange',data)).data;
  if(result.sessionToken){applySession(result);await normalizeWorkspaceRoute();await afterOpen();privacyIntro.value=!!result.newDevice;if(result.newDevice)await showAccount();}else await detectSession();
}
async function callback() {
  try {
    const pending=JSON.parse(sessionStorage.getItem('auricwell.mobile.pending') || 'null');sessionStorage.removeItem('auricwell.mobile.pending');
    const url=location.href;await router.replace('/mobile');
    await completeSignIn(url,pending);
  }catch(e){const message=mobileRequestError(e);if(!await detectSession())error.value=message;}
}
async function enter(biometrics=false) {
  busy.value=true;error.value='';const current=generation;
  try {
    const result=biometrics?await MobileDevice.unlockWithBiometrics():await deviceRequest('POST',appLock.value.method==='none'?'/resume':'/unlock',{passcode:passcode.value});
    if(current!==generation)return;
    applySession(result);await normalizeWorkspaceRoute();
    await afterOpen();
  }catch(e){
    if(current!==generation)return;
    error.value=mobileRequestError(e);
    const code=e.response?.data?.error?.code || e.code;
    if(['MOBILE_SIGN_IN_REQUIRED','MOBILE_ACCOUNT_CHANGED','ACCOUNT_DISABLED','ACCOUNT_UNAVAILABLE','MOBILE_WORKSPACE_UNAVAILABLE','PRODUCT_SESSION_MISMATCH'].includes(code))screen.value='signin';
    if(['MOBILE_SETUP_REQUIRED','MOBILE_METHOD_CHANGED'].includes(code))await detectSession();
  } finally {busy.value=false;}
}
async function afterOpen() {
  const token=access.value?.sessionToken;if(!token)return;
  if(native){
    const target=await MobileDevice.pendingNotification();if(access.value?.sessionToken!==token)return;
    if(target.url)await openNotification(target.url);else if(route.query.kind)await openNotification(location.pathname+location.search);
    try{const {data}=await mobileApi.get('/profile',{headers:{'X-Quick-View-Session':token}});if(access.value?.sessionToken!==token)return;profile.value=data;
      if(data.notifications.enabled){const registration=await MobileDevice.registerPush();if(access.value?.sessionToken===token)await registerPush({enabled:true,...registration});}
    }catch{/* Notification setup must not prevent opening the workspace. */}
  }else if(route.query.kind)await openNotification(location.pathname+location.search);
}
function lock() {
  notificationPanel.value=false;
  clearFamilyDevice();
  ++generation;
  const old=access.value;access.value=null;profile.value=null;accountOpen.value=false;passcode.value='';confirmCode.value='';newCode.value='';newCodeConfirm.value='';
  if(screen.value==='workspace')screen.value='locked';
  if(old)axios.post(`${quickApiBase}/session/logout`,{},{headers:{'X-Quick-View-Session':old.sessionToken},withCredentials:true}).catch(()=>{});
}
function background() {if(native)return;if(document.hidden){wasBackground=true;if(['workspace','locked','loading'].includes(screen.value))lock();}else if(wasBackground){wasBackground=false;if(appLock.value.method==='none' && screen.value==='locked')detectSession();}}
function restorePage(event){if(!event.persisted)return;if(location.pathname==='/mobile/connect' && connectQuery().clientId==='web'){location.replace('https://auricwell.com/mobile');return;}lock();detectSession();}
function recoverSignIn(){lock();screen.value='signin';error.value='';}
async function saveAppLock(){
  busy.value=true;lockNotice.value='';
  try{
    if(lockChoice.value==='code' && newCode.value!==newCodeConfirm.value)throw new Error('The quick access codes must match.');
    const result=lockChoice.value==='biometric'?await MobileDevice.configureBiometrics({sessionToken:access.value.sessionToken}):await deviceRequest('POST','/app-lock',{method:lockChoice.value,passcode:newCode.value});
    applySession(result);newCode.value='';newCodeConfirm.value='';privacyIntro.value=false;
    lockNotice.value=lockChoice.value==='none'?'App lock is off. Your device stays signed in.':lockChoice.value==='code'?'Your optional quick access code is saved.':'Biometric app lock is enabled.';
  }catch(e){lockNotice.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function signOut() {
  clearClinicalRecovery({deactivate:true});
  busy.value=true;error.value='';
  lock();
  try { await deviceRequest('POST','/logout');workspace.value=null;screen.value='signin'; }
  catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function showAccount() {
  const current=generation,token=access.value?.sessionToken;
  lockChoice.value=appLock.value.method;newCode.value='';newCodeConfirm.value='';lockNotice.value='';accountOpen.value=true;accountLoading.value=true;
  try {const {data}=await mobileApi.get('/profile',{headers:{'X-Quick-View-Session':token}});if(current===generation && access.value?.sessionToken===token)profile.value=data;}
  catch(e){if(current===generation && access.value?.sessionToken===token)error.value=mobileRequestError(e);}
  finally{accountLoading.value=false;}
}
async function switchWorkspace(agencyId,query=null) {
  if(busy.value || !Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<=0)return;
  const current=generation,token=access.value?.sessionToken;busy.value=true;error.value='';
  try {
    const result=await deviceRequest('POST','/workspace',{agencyId:Number(agencyId)});
    if(current!==generation || access.value?.sessionToken!==token)return;
    if(result.profile?.surface==='family'){applySession(result);accountOpen.value=false;await router.replace({path:`/mobile/family/${encodeURIComponent(result.profile.workspace.portal_url || 'family')}/guardian`,query:{panel:'family'}});return;}
    // Move away from the previous tenant's resource before mounting its replacement.
    await router.replace({path:'/mobile/workspace',query:route.query.view==='mywork'?{...route.query}:{view:'mywork'}});
    applySession(result);accountOpen.value=false;
    if(query)await router.push({path:'/mobile/workspace',query});
  }catch(e){error.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function changeWorkspace(event){await switchWorkspace(event.target.value);}
async function openWorkspaceItem({agencyId,query}){await switchWorkspace(agencyId,query);}
function connectLoginUrl(){
 const query=connectQuery(),path=query.loginPath;
 if(!/^\/(?:[a-z0-9-]+\/)*login\/?$/i.test(path || ''))return null;
 const login=new URL(path,location.origin);login.searchParams.set('redirect',location.pathname+location.search);if(query.username)login.searchParams.set('u',query.username);login.searchParams.set('mobile','1');return login.href;
}
async function changeConnectAccount(){
 const destination=connectLoginUrl();if(!destination || busy.value)return;
 busy.value=true;error.value='';
 try{
  // Explicit account change ends the primary browser session; no device is enrolled here.
  try{await axios.post('/api/auth/logout',{reason:'mobile_account_change'},{withCredentials:true});}catch(e){if(e.response?.status!==401)throw e;}
  for(const key of ['user','authToken','currentAgency','userAgencies','sessionId'])localStorage.removeItem(key);
  location.replace(destination);
 }catch(e){error.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function registerPush(payload) {
  if(!access.value)return;
  const {data}=await mobileApi.post('/notifications',payload,{headers:{'X-Quick-View-Session':access.value.sessionToken}});
  notificationStatus.value=payload.enabled?(native&&!data.appleReady || !native&&!data.webReady?'Permission saved. Server notification delivery is awaiting configuration.':'Notifications enabled for the whole Conversa suite.'):'Notifications disabled on this device.';
}
async function enableNotifications() {
  busy.value=true;notificationStatus.value='';
  try {
    if(native){const result=await MobileDevice.registerPush();await registerPush({enabled:true,...result});return;}
    if(!('serviceWorker' in navigator) || !('PushManager' in window))throw new Error('For iPhone browser notifications, add Auricwell to your Home Screen and open it there.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Notifications are off in this device’s settings.');
    if(!access.value)throw new Error('Reopen your workspace before enabling notifications.');
    let config=profile.value?.notifications;
    if(!config){const {data}=await mobileApi.get('/profile',{headers:{'X-Quick-View-Session':access.value.sessionToken}});config=data.notifications;}
    if(!config?.webPublicKey)throw new Error('Server notification delivery is awaiting configuration.');
    const worker=await navigator.serviceWorker.register('/mobile-sw.js',{scope:'/mobile/'});
    if(!worker.active)await new Promise((resolve,reject)=>{const active=worker.installing || worker.waiting;if(!active)return reject(new Error('Could not activate notifications. Try again.'));active.addEventListener('statechange',()=>{if(active.state==='activated')resolve();if(active.state==='redundant')reject(new Error('Could not activate notifications. Try again.'));});});
    const key=Uint8Array.from(atob(config.webPublicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const subscription=await worker.pushManager.getSubscription() || await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await registerPush({enabled:true,subscription:subscription.toJSON()});
  }catch(e){notificationStatus.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function openNotification(url) {
  const parsed=new URL(url,'https://auricwell.com');
  if(parsed.origin!=='https://auricwell.com' || parsed.pathname!=='/mobile/workspace')return;
  if(!access.value){await router.replace(parsed.pathname+parsed.search);return;}
  const kind=parsed.searchParams.get('kind'),id=parsed.searchParams.get('id');
  if(!['email','sms','chat'].includes(kind) || !/^[1-9]\d*$/.test(id || ''))return;
  try {
    const {data}=await mobileApi.get(`/notification-target/${kind}/${id}`,{headers:{'X-Quick-View-Session':access.value.sessionToken}});
    if(profile.value?.surface==='family'){await router.push({path:`/mobile/family/${encodeURIComponent(profile.value.workspace.portal_url || 'family')}/guardian`,query:{panel:'family_messages',familyThreadId:data.threadId}});return;}
    if(route.query.kind)await router.replace({path:'/mobile/workspace',query:{view:'home'}});
    if(route.path!=='/mobile/workspace' || JSON.stringify(route.query)!==JSON.stringify(data))await router.push({path:'/mobile/workspace',query:{view:'home',...data}});
    await nextTick();qv.value?.openDeepLink();
  }catch(e){error.value=mobileRequestError(e);}
}
onMounted(async()=>{
  notificationTimer=setInterval(()=>{if(!document.hidden)void refreshNotificationCount();},30000);
  document.addEventListener('visibilitychange',background);window.addEventListener('pageshow',restorePage);
  interceptor=axios.interceptors.response.use(r=>r,e=>{const failed=e.config?.headers?.get?.('X-Quick-View-Session') || e.config?.headers?.['X-Quick-View-Session'];if(access.value && failed===access.value.sessionToken && [401,423].includes(e.response?.status))lock();return Promise.reject(e);});
  if(native){
    try {biometry.value=(await MobileDevice.status()).biometrics;deviceListener=await MobileDevice.addListener('deviceLocked',lock);privacyListener=await MobileDevice.addListener('privacyReady',async()=>{if(appLock.value.method==='none' && screen.value==='locked' && !busy.value)await detectSession();await nextTick();await MobileDevice.reveal();});pushListener=await MobileDevice.addListener('notificationTapped',event=>openNotification(event.url));}catch{error.value='This native build needs the Auricwell device plugin.';}
  }
  if(!native && location.pathname==='/mobile/connect')await loadConnect();
  else if(!native && location.pathname==='/mobile/callback')await callback();
  else await detectSession();
  if(native){await nextTick();await MobileDevice.reveal();}
});
onUnmounted(()=>{
  clearInterval(notificationTimer);lock();document.removeEventListener('visibilitychange',background);window.removeEventListener('pageshow',restorePage);axios.interceptors.response.eject(interceptor);deviceListener?.remove();pushListener?.remove();privacyListener?.remove();});
</script>

<template>
  <div class="mobile-app">
    <template v-if="screen==='workspace' && access">

      <MobileFamilyPortal v-if="profile?.surface==='family'" :key="access.sessionToken" :profile="profile" @logout="signOut" @account="showAccount"/>
      <QuickView v-else :key="access.sessionToken" ref="qv" :mobile-session="access" :notification-unread="notificationUnread" @locked="lock" @account="showAccount" @notifications="notificationSettings=false;notificationPanel=true" @open-workspace-item="openWorkspaceItem" />
      <MobileNotifications v-if="notificationPanel && profile?.surface!=='family'" :key="access.sessionToken" :request="notificationRequest" :workspace-id="workspace?.id" :start-in-settings="notificationSettings" @close="notificationPanel=false;refreshNotificationCount()" @changed="refreshNotificationCount" @open="openNotificationEmail" />
      <p v-if="error && !accountOpen" class="workspace-error" role="alert">{{ error }} <button @click="error=''" aria-label="Dismiss workspace error">×</button></p>
      <div v-if="accountOpen" class="mobile-overlay" @keydown.esc="accountOpen=false">
        <section class="mobile-card account" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <button class="close" @click="accountOpen=false;privacyIntro=false" aria-label="Close My Account">×</button>
          <h1 id="account-title">My Account</h1><p>{{ profile?.user?.firstName }} {{ profile?.user?.lastName }}<br>{{ profile?.user?.email }}</p>
          <label v-if="profile?.agencies?.length>1">Workspace<select :value="workspace?.id" :disabled="busy" @change="changeWorkspace"><option v-for="agency in profile.agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option></select></label>
          <a v-if="accountLink" :href="accountLink" target="_blank" rel="noopener">Manage profile <ArrowRight :size="17" /></a>
          <a v-if="securityLink" :href="securityLink" target="_blank" rel="noopener">Security & passkeys <ArrowRight :size="17" /></a>
          <a v-if="preferencesLink" :href="preferencesLink" target="_blank" rel="noopener">Account preferences <ArrowRight :size="17" /></a>
          <button v-if="profile?.surface!=='family'" class="secondary" @click="accountOpen=false;qv?.openPreferences()">Mobile layout &amp; swipe settings</button>
          <section class="mobile-lock-options" aria-labelledby="app-lock-title">
            <h2 id="app-lock-title">App lock · optional</h2>
            <p>Your sign-in stays on this device. Choose an extra app lock if you want one; otherwise use your phone’s normal screen lock.</p>
            <form @submit.prevent="saveAppLock">
              <label for="mobile-app-lock">App lock</label><select id="mobile-app-lock" v-model="lockChoice" :disabled="busy"><option value="none">No extra app lock</option><option value="code">Six-digit quick access code</option><option v-if="native && biometry" value="biometric">Face ID / Touch ID</option></select>
              <template v-if="lockChoice==='code'"><label>New six-digit code<input v-model="newCode" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></label><label>Confirm code<input v-model="newCodeConfirm" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></label></template>
              <button :disabled="busy">{{ lockChoice==='biometric'?'Enable Face ID / Touch ID':'Save app lock preference' }}</button>
            </form>
            <button v-if="privacyIntro" class="secondary" @click="accountOpen=false;privacyIntro=false">Not now · open my workspace</button>
            <p role="status">{{ lockNotice }}</p>
          </section>
          <h2><Bell :size="18" />Conversa notifications</h2><p>{{ profile?.surface==='family'?'Secure messages from your care team.':'Email, text messages, direct messages, channels, replies, mentions and secure messages.' }} Message previews stay private.</p>
          <button :disabled="busy || accountLoading" @click="enableNotifications">Enable notifications</button><button class="secondary" :disabled="busy" @click="registerPush({enabled:false})">Turn off on this device</button><p role="status">{{ notificationStatus }}</p>
          <button class="secondary" @click="lock"><LockKeyhole :size="17" />{{ appLock.method==='none'?'Hide workspace':'Lock workspace' }}</button><button class="secondary danger" :disabled="busy" @click="signOut"><LogOut :size="17" />Sign out of this device</button>
          <p v-if="error" role="alert" class="error">{{ error }}</p>
        </section>
      </div>
    </template>
    <main v-else class="mobile-gate">
      <header><AuricWellBrand context="Your daily workspace" /></header>
      <section class="mobile-card">
        <p v-if="screen==='loading'" role="status">Opening Auricwell…</p>
        <template v-else-if="screen==='connect'">
          <template v-if="connectVerification"><h1>Verify your sign-in</h1><p>{{ connectVerification.name }} · {{ connectVerification.email }}</p><AccountSecurityPanel :show-workspace-return="false"/><button class="secondary" :disabled="busy" @click="loadConnect">I’ve verified · continue connecting</button></template><h1 v-else>Connect this device</h1><p v-if="connectAccount">Continue as {{ connectAccount.user.firstName }} {{ connectAccount.user.lastName }} ({{ connectAccount.user.email }}).</p>
          <label v-if="connectAccount">Workspace<select v-model="selectedAgency"><option v-for="agency in connectAccount.agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option></select></label>
          <p>Your account’s permissions apply. This device will stay signed in until you sign out or account security requires a new sign-in.</p>
          <button :disabled="busy || !selectedAgency" @click="authorize">Connect to Auricwell <ArrowRight :size="18" /></button>
          <template v-if="error"><button class="secondary" :disabled="busy" @click="loadConnect">Try again</button><button v-if="connectLoginUrl()" class="secondary" :disabled="busy" @click="changeConnectAccount">Sign in with a different account</button><a href="https://auricwell.com/mobile">Restart Auricwell sign-in</a></template>
        </template>
        <form v-else-if="screen==='signin'" @submit.prevent="startSignIn">
          <h1>Welcome to AuricWell.</h1><p>Use your existing account to open your family portal, school portal, or staff workspace.</p>
          <label>Username or email<input v-model="username" autocomplete="username" placeholder="Your username or email" required autocapitalize="none" spellcheck="false"></label><label v-if="organizationChoices.length">School or organization<select v-model="selectedAgency" required><option value="">Choose your school</option><option v-for="org in organizationChoices" :key="org.id" :value="org.portal_url || org.slug">{{ org.name }}</option></select></label>
          <button :disabled="busy">{{ busy?'Connecting…':'Continue to sign in' }}<ArrowRight :size="18" /></button>
          <p class="small">Sign in with your password, SSO or an existing passkey. You can add a passkey in your account settings.</p>
        </form>
        <form v-else @submit.prevent="enter()">
          <span class="gate-icon"><LockKeyhole :size="26" /></span><p class="eyebrow">{{ workspace?.name || 'Your workspace' }}</p>
          <h1>{{ appLock.method==='none'?'Workspace hidden':'Welcome back' }}</h1>
          <p>{{ appLock.method==='none'?'Your account is still signed in. Continue when you’re ready.':'Unlock to pick up where you left off. Your account is still signed in.' }}</p>
          <label v-if="appLock.method==='code'">Quick access code<input v-model="passcode" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password" required></label>
          <button v-if="appLock.method!=='biometric'" :disabled="busy || appLock.method==='code' && passcode.length!==6">{{ busy?'Opening…':appLock.method==='none'?'Continue to workspace':'Unlock workspace' }}<ArrowRight :size="18" /></button>
          <button v-if="native && biometry && appLock.method==='biometric'" type="button" class="secondary" :disabled="busy" @click="enter(true)"><Fingerprint :size="20" />Unlock with Face ID / Touch ID</button>
          <button type="button" class="text-button" :disabled="busy" @click="recoverSignIn">Use password, SSO or passkey</button><button type="button" class="text-button" :disabled="busy" @click="signOut">Sign out of this device</button>
        </form>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
      </section>
      <footer>Private access. Your organization’s permissions apply.</footer>
    </main>
  </div>
</template>

<style>
.workspace-error{position:fixed;top:calc(76px + env(safe-area-inset-top));left:12px;right:12px;z-index:90;margin:0;padding:12px 42px 12px 14px;background:#fff3f5;color:#a32c43;border:1px solid #f0cbd4;border-radius:10px;box-shadow:0 5px 20px #183b6b16;font-size:14px}.workspace-error button{position:absolute;right:8px;top:5px;border:0;background:transparent;color:inherit;font-size:26px;cursor:pointer}
html,body,#app{margin:0;min-height:100%;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183154}*{box-sizing:border-box}.mobile-app{min-height:100dvh;background:#f3f6fc}.mobile-gate{min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:calc(30px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom));background:radial-gradient(ellipse at 90% 0,#e5edff,transparent 65%)}.mobile-gate header{align-self:flex-start;margin-bottom:60px}.mobile-card{width:min(100%,460px);background:white;border:1px solid #e0e8f5;border-radius:24px;padding:34px;box-shadow:0 20px 60px #2348780a}.mobile-card h1{font-size:30px;line-height:1.15;letter-spacing:-1px;margin:0 0 16px}.mobile-card h2{font-size:17px;display:flex;gap:8px;align-items:center;margin-top:28px}.mobile-card p{font-size:15px;line-height:1.65;color:#657891}.mobile-card label{display:block;font-size:14px;font-weight:600;margin:25px 0 18px}.mobile-card input,.mobile-card select{display:block;width:100%;font:inherit;padding:15px 16px;border:1px solid #cfdaec;border-radius:12px;margin-top:10px;background:#fafcff;color:#183154;min-height:50px}.mobile-card input[type=password]{letter-spacing:10px;text-align:center;font-size:22px}.mobile-card button,.mobile-card a{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 18px;border:1px solid transparent;border-radius:12px;font:inherit;font-size:14px;font-weight:600;background:#285fe8;color:white;min-height:48px;text-decoration:none;cursor:pointer;margin-top:12px}.mobile-card button:disabled{opacity:.55;cursor:wait}.mobile-card .secondary,.mobile-card a{background:#f1f5fc;color:#254978;border-color:#e1e9f6}.mobile-card .text-button{background:transparent;color:#526a8d;font-weight:400}.mobile-card .small{font-size:12px;margin-top:23px}.mobile-card .error{color:#a32c43;background:#fff3f5;padding:12px;border-radius:10px}.mobile-card .eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}.gate-icon{display:inline-flex;padding:15px;border-radius:16px;background:#eff4ff;color:#3165da;margin-bottom:14px}.mobile-gate footer{font-size:12px;color:#7788a0;margin-top:30px;text-align:center}.mobile-account-button{position:fixed;right:20px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:40;display:flex;gap:7px;align-items:center;padding:12px 16px;background:#fff;border:1px solid #d6e1f3;box-shadow:0 5px 20px #183b6b16;color:#254978;border-radius:30px;font:inherit;font-size:12px;cursor:pointer}.mobile-overlay{position:fixed;inset:0;background:#152b4d80;backdrop-filter:blur(10px);z-index:100;display:grid;place-items:center;padding:20px}.mobile-card.account{position:relative;max-height:calc(100dvh - 40px);overflow:auto}.mobile-card .close{position:absolute;right:14px;top:8px;background:transparent;color:#607796;width:35px;padding:0;min-height:35px;font-size:26px}.mobile-card .danger{color:#9c3345}:focus-visible{outline:3px solid #80acff;outline-offset:3px}@media(min-width:1000px){.mobile-account-button{bottom:24px}.mobile-gate header{margin-bottom:80px}}@media(max-width:500px){.mobile-card{padding:26px}.mobile-gate header{margin-bottom:40px}}
</style>
