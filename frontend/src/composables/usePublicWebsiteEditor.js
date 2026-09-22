import {reactive} from 'vue';
export const websiteEditor=reactive({active:false,page:null,changes:{}});
export function websiteContent(key,fallback,settings={}) {
 const saved=websiteEditor.page?.slug==='itsco'?websiteEditor.page.brandingJson?.itscoWebsite:settings;
 return websiteEditor.changes[key] ?? saved?.inlineContent?.[key] ?? fallback;
}
export function mergeWebsiteEdits(page,changes) {
 return {...page.brandingJson,itscoWebsite:{...page.brandingJson?.itscoWebsite,inlineContent:{...page.brandingJson?.itscoWebsite?.inlineContent,...changes}}};
}
