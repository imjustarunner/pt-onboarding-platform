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
  return error.response?.data?.error?.message || error.message || 'Could not connect. Please try again.';
}
