import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { safeMarketingHref } from '../utils/marketingPageQuality';
export function publicWebsiteUrl(value) {
 const href=safeMarketingHref(value);
 if (!href) return '';
 if (/^\/(?!\/)/.test(href)) return href;
 try { const url=new URL(href); return url.protocol==='https:' && !url.username && !url.password ? href : ''; } catch { return ''; }
}
export function useStandalonePublicWebsite(slug, title) {
 const route=useRoute(),page=ref(null),loading=ref(true),error=ref(''),menuOpen=ref(false),previewNotice=ref('');
 const section=computed(()=>String(route.params.section||''));
 const settings=computed(()=>page.value?.branding?.[`${slug}Website`]||{});
 const path=s=>`/p/${slug}${s?'/'+s:''}`;
 const preview=window.parent!==window&&route.query.marketingPreview==='1';
 let version=0;
 async function load(){const n=++version;loading.value=true;error.value='';try{const{data}=await api.get(`/public/marketing-pages/${slug}`,{skipAuthRedirect:true,skipGlobalLoading:true});if(n!==version)return;if(data?.page?.slug!==slug)throw Error();page.value=data.page;}catch(e){if(n===version)error.value=e.response?.status===404?'This website is not published yet. Please check back soon.':'We couldn’t load this website. Please try again.';}finally{if(n===version)loading.value=false;}}
 function receive(e){if(!preview||e.source!==window.parent||e.origin!==window.location.origin||e.data?.type!=='marketing-preview'||e.data.page?.slug!==slug)return;version++;page.value=e.data.page;loading.value=false;error.value='';}
 function closeMenu(e){menuOpen.value=false;e.currentTarget?.querySelector('button[aria-controls]')?.focus();}
 function guardPreview(e){if(preview){e.preventDefault();previewNotice.value='Open the published website to continue.';}}
 watch(section,()=>{menuOpen.value=false;previewNotice.value='';document.title=title;});
 onMounted(()=>{window.addEventListener('message',receive);if(preview)window.parent.postMessage({type:'marketing-preview-ready'},window.location.origin);else load();});
 onUnmounted(()=>{version++;window.removeEventListener('message',receive);});
 return {route,page,loading,error,menuOpen,section,settings,path,load,preview,previewNotice,guardPreview,closeMenu};
}
