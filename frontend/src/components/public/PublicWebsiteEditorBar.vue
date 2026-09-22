<template>
 <aside v-if="slug && !framed" class="website-editor-bar" aria-label="Website editing" translate="no" data-analytics-ignore>
  <strong>{{websiteEditor.active?'Editing ITSCO':'Website tools'}}</strong>
  <button v-if="slug==='itsco' && !websiteEditor.active" :disabled="busy" @click="start">Edit this page</button>
  <template v-if="websiteEditor.active"><span>Click outlined text or photos to edit.</span><button :disabled="busy || !dirty" @click="save">{{busy?'Saving…':'Save changes'}}</button><button :disabled="busy" @click="cancel">{{dirty?'Discard changes':'Done'}}</button></template>
  <router-link v-if="slug!=='itsco'" :to="marketingEditorPath(slug)">Edit website</router-link>
  <button :disabled="busy" @click="logout">Log out</button>
  <span v-if="notice" role="status">{{notice}}</span><span v-if="error" role="alert">{{error}}</span>
 </aside>
 <footer v-else-if="!framed && managementUrl" class="website-management-link" translate="no" data-analytics-ignore>
  <span v-if="checking" role="status">Checking your session…</span><a v-else :href="signInUrl">Staff sign in</a>
 </footer>
 <Teleport to="body">
  <aside v-if="websiteEditor.active && selected" class="website-edit-panel" aria-label="Edit selected content" translate="no" data-analytics-ignore>
   <div class="edit-panel-heading"><h2>{{selected.image?'Change photo':'Edit text'}}</h2><button aria-label="Close editing panel" @click="selected=null">×</button></div>
   <template v-if="selected.image"><img :src="selectedValue" alt="Selected website image"/><label class="upload-button">Choose a photo<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" :disabled="busy" @change="upload"/></label><p>Preview your replacement here, then save changes to publish it.</p></template>
   <label v-else>Page text<textarea :value="selectedValue" rows="7" @input="change($event.target.value)"/></label>
   <button @click="resetSelected">Undo this change</button><p v-if="error" role="alert">{{error}}</p>
  </aside>
 </Teleport>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import {editableWebsiteSlug,marketingEditorPath,websiteManagementUrl} from '../../utils/publicWebsiteEditing';
import {websiteEditor,mergeWebsiteEdits} from '../../composables/usePublicWebsiteEditor';
import {publicSitePaths} from '../../utils/publicDomainRouting';
import api from '../../services/api';
import {invalidatePublicWebsite} from '../../services/publicWebsiteRead';
const route=useRoute(),router=useRouter(),auth=useAuthStore(),framed=window.parent!==window;
const checking=ref(false),verified=ref(false),busy=ref(false),error=ref(''),notice=ref(''),selected=ref(null);
const managementUrl=computed(()=>websiteManagementUrl(route,window.location.hostname));
const signInUrl=computed(()=>{const target=new URL(managementUrl.value||route.fullPath,window.location.origin);return `${target.origin}/login?redirect=${encodeURIComponent(target.pathname+target.search)}`;});
const slug=computed(()=>verified.value?editableWebsiteSlug({user:auth.user,route,hostname:window.location.hostname,framed}):null);
const dirty=computed(()=>Object.keys(websiteEditor.changes).length>0);
const selectedValue=computed(()=>selected.value?websiteEditor.changes[selected.value.key]??websiteEditor.page?.brandingJson?.itscoWebsite?.inlineContent?.[selected.value.key]??selected.value.original:'');
const options={skipAuthRedirect:true,skipGlobalLoading:true};
async function getPage(){const {data}=await api.get('/platform/public-marketing-pages',options);const page=data.pages?.find(p=>p.slug===slug.value);if(!page)throw Error('Website editing is not available for this account.');return page;}
async function start(){busy.value=true;error.value='';notice.value='';try{websiteEditor.page=await getPage();websiteEditor.changes={};websiteEditor.active=true;document.body.classList.add('website-editing');}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
function change(value){websiteEditor.changes={...websiteEditor.changes,[selected.value.key]:value};}
function resetSelected(){const changes={...websiteEditor.changes};delete changes[selected.value.key];websiteEditor.changes=changes;}
function stop(){websiteEditor.active=false;selected.value=null;document.body.classList.remove('website-editing');}
function cancel(){if(dirty.value&&!window.confirm('Discard your unsaved website changes?'))return;websiteEditor.changes={};stop();}
async function save(){busy.value=true;error.value='';try{const latest=await getPage();const brandingJson=mergeWebsiteEdits(latest,websiteEditor.changes);await api.put(`/platform/public-marketing-pages/${latest.id}`,{brandingJson},options);websiteEditor.page={...latest,brandingJson};invalidatePublicWebsite('/public/marketing-pages/itsco/website-data');websiteEditor.changes={};notice.value='Changes published.';stop();}catch(e){error.value=e.response?.data?.error?.message||'Could not save. Your draft is still here.';}finally{busy.value=false;}}
async function upload(event){const file=event.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp|avif)$/.test(file.type)||file.size>8*1024*1024){error.value='Choose a PNG, JPEG, WebP, or AVIF image under 8 MB.';return;}const key=selected.value.key;busy.value=true;error.value='';try{const body=new FormData();body.append('file',file);const {data}=await api.post('/platform/public-marketing-pages/upload',body,{...options,headers:{'Content-Type':'multipart/form-data'}});if(!data?.url)throw Error('Upload did not return an image.');websiteEditor.changes={...websiteEditor.changes,[key]:data.url};}catch(e){error.value=e.response?.data?.error?.message||'Could not upload this image.';}finally{busy.value=false;event.target.value='';}}
function pick(event){if(!websiteEditor.active||busy.value)return;const el=event.target.closest('[data-website-field],[data-website-image]');if(!el)return;if(el.hasAttribute('data-website-image')&&event.target.closest('a,button,input,select,textarea')&&!event.target.closest('[data-website-field],img[data-website-image]'))return;event.preventDefault();event.stopPropagation();const image=el.hasAttribute('data-website-image');selected.value={key:el.getAttribute(image?'data-website-image':'data-website-field'),image,original:image?(el.getAttribute('data-website-image-url')||el.currentSrc||el.src||''):el.textContent.trim()};}
async function logout(){if(dirty.value&&!window.confirm('Discard your unsaved changes and log out?'))return;websiteEditor.changes={};websiteEditor.page=null;stop();await auth.logout();}
function beforeUnload(event){if(dirty.value){event.preventDefault();event.returnValue='';}}
const removeNavigationGuard=router.beforeEach(()=>{if(busy.value)return false;if(dirty.value&&!window.confirm('Discard your unsaved website changes?'))return false;websiteEditor.changes={};stop();});
watch(()=>route.path,()=>{selected.value=null;});
onMounted(async()=>{document.addEventListener('click',pick,true);window.addEventListener('beforeunload',beforeUnload);if(framed||(publicSitePaths(window.location.hostname)&&!auth.user&&route.query.editWebsite!=='1'&&route.query.sso!=='1'))return;checking.value=true;try{const {data}=await api.get('/users/me',options);if(data?.id&&data.role){auth.setAuth(null,data);verified.value=true;if(route.query.editWebsite==='1'&&slug.value==='itsco')await start();}}catch{verified.value=false;}finally{checking.value=false;}});
onBeforeUnmount(()=>{removeNavigationGuard();stop();document.removeEventListener('click',pick,true);window.removeEventListener('beforeunload',beforeUnload);});
</script>
<style>
.website-editor-bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10050;display:flex;align-items:center;flex-wrap:wrap;gap:9px;width:max-content;max-width:calc(100vw - 24px);padding:10px 14px;background:#fff;color:#183f35;border:1px solid #a8cdbb;border-radius:12px;box-shadow:0 4px 24px #0002;font:13px/1.4 system-ui,sans-serif}.website-editor-bar button,.website-edit-panel button,.upload-button{border:1px solid #b6cebf;border-radius:8px;background:#edf7f1;color:#164b38;padding:9px 12px;font:inherit;cursor:pointer}.website-editor-bar span{font-size:12px}.website-editor-bar [role=alert]{color:#9c2525}.website-management-link{padding:14px;text-align:center;font:12px/1.5 system-ui,sans-serif;background:#fff;color:#334155}.website-management-link a{color:inherit}.website-editing [data-website-field],.website-editing [data-website-image]{outline:2px dashed #358066;outline-offset:4px;cursor:pointer}.website-editing [data-website-field]:hover,.website-editing [data-website-image]:hover{outline:3px solid #c69524}.website-edit-panel{position:fixed;right:16px;top:90px;z-index:10060;width:340px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 120px);overflow:auto;padding:20px;background:#fff;color:#183f35;border:1px solid #b5cfc1;border-radius:14px;box-shadow:0 12px 40px #0003;font:14px/1.5 system-ui,sans-serif;box-sizing:border-box}.edit-panel-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.website-edit-panel h2{font-size:20px}.website-edit-panel img{width:100%;max-height:230px;object-fit:contain;background:#eef4f0;border-radius:8px}.website-edit-panel label{display:grid;gap:10px;margin:15px 0}.website-edit-panel textarea{width:100%;box-sizing:border-box;font:inherit;border:1px solid #abc9ba;border-radius:8px;padding:10px}.website-edit-panel input{max-width:100%}.website-editor-bar button:disabled{opacity:.5}.website-editor-bar :focus-visible,.website-edit-panel :focus-visible{outline:3px solid #d6a732;outline-offset:3px}
</style>
