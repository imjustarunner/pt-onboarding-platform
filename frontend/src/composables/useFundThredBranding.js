import {onUnmounted,shallowRef,toValue,watch} from 'vue';
import {FUNDTHRED} from '../config/fundthredProduct';
export const fundthredBrowserBrand=shallowRef(null);

// Product identity does not overwrite the organization's stored theme.
export function useFundThredBranding(title,enabled=true){
  const owner=Symbol('fundthred');let previousTitle,previousIcon,appliedTitle,icon;
  function restore(){
    if(appliedTitle===undefined)return;
    // RouterView mounts the next page before the previous page's unmounted
    // hook runs. An outgoing FundThred page must not reset the new identity.
    if(fundthredBrowserBrand.value?.owner!==owner){appliedTitle=undefined;return;}
    if(document.title===appliedTitle)document.title=previousTitle;
    if(icon?.getAttribute('href')===FUNDTHRED.icon){if(previousIcon==null)icon.removeAttribute('href');else icon.setAttribute('href',previousIcon);}
    if(fundthredBrowserBrand.value?.owner===owner)fundthredBrowserBrand.value=null;
    appliedTitle=undefined;
  }
  watch(()=>[toValue(title),toValue(enabled)],([label,on])=>{
    if(!on)return restore();
    if(appliedTitle===undefined){const existing=fundthredBrowserBrand.value;previousTitle=existing?existing.previousTitle:document.title;icon=document.querySelector('link[rel="icon"]');previousIcon=existing?existing.previousIcon:icon?.getAttribute('href');}
    appliedTitle=label||'FundThred | Finance operations';
    fundthredBrowserBrand.value={owner,title:appliedTitle,favicon:FUNDTHRED.icon,previousTitle,previousIcon};
    document.title=appliedTitle;icon?.setAttribute('href',FUNDTHRED.icon);
  },{immediate:true,flush:'post'});
  onUnmounted(restore);
}
