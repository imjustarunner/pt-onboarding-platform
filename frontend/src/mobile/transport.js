import axios from 'axios';
import { Capacitor, registerPlugin } from '@capacitor/core';

export const native=Capacitor.isNativePlatform();
export const MobileDevice=registerPlugin('AuricwellDevice');
export const apiOrigin=native?'https://auricwell.com':'';
export const mobileApi=axios.create({baseURL:`${apiOrigin}/api/mobile`,withCredentials:true,headers:{'X-Auricwell-Mobile':'1'}});
export const quickApiBase=`${apiOrigin}/api/quick-view`;

export function randomSecret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function pkceChallenge(verifier) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function accountUrl(workspace,path='account-info') {
  if(!workspace?.loginUrl)return '';
  const url=new URL(workspace.loginUrl);url.pathname=url.pathname.replace(/login\/?$/,path);url.search='';url.hash='';return url.href;
}
export function mobileRequestError(error) {
  const server=error?.response?.data?.error?.message;
  if(server)return server;
  if(['ERR_NETWORK','ECONNABORTED','ETIMEDOUT','MOBILE_CONNECTION_FAILED','MOBILE_INVALID_RESPONSE'].includes(error?.code) || /^(?:Network error|Network Error|Failed to fetch|Could not connect\. Please try again\.)$/i.test(error?.message || ''))return 'Could not reach AuricWell. Your code is still entered. Check your connection and tap Try again. No extra attempt will be sent automatically.';
  return error?.message || 'Could not reach AuricWell. Please try again.';
}
