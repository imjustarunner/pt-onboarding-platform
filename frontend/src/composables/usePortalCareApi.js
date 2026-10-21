import {inject,unref} from 'vue';
import baseApi from '../services/api';
// Each mounted client panel captures its selected agency/service. Family-wide
// panels continue to use the ordinary API and aggregate authorized profiles.
export function usePortalCareApi(){
 const context=inject('portalCareContext',null);
 if(!context)return baseApi;
 const config=(url,options={})=>{
  const care=unref(context);if(!care?.agencyId)return options;
  const match=String(url).match(/\/(?:clients|dependents)\/(\d+)(?:\/|$)/);
  if(match&&Number(match[1])!==Number(care.clientId))return options;
  return {...options,params:{agencyId:care.agencyId,serviceId:care.serviceId||undefined,...options.params}};
 };
 return {get:(url,options)=>baseApi.get(url,config(url,options)),post:(url,body,options)=>baseApi.post(url,body,config(url,options)),put:(url,body,options)=>baseApi.put(url,body,config(url,options)),patch:(url,body,options)=>baseApi.patch(url,body,config(url,options)),delete:(url,options)=>baseApi.delete(url,config(url,options))};
}
