import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import api from '../api';
import {useAuthStore} from '../../store/auth';
vi.mock('../../utils/biometricAuth',()=>({saveBiometricToken:vi.fn(),clearBiometricToken:vi.fn()}));
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setActivePinia(createPinia());});
describe('fresh login session ownership',()=>{
 it('removes the prior bearer on a verified cookie-only login',()=>{
  localStorage.setItem('authToken','old-test-token');
  useAuthStore().setAuth(null,{id:1,role:'client_guardian'},'fresh-session');
  expect(localStorage.getItem('authToken')).toBeNull();
  expect(localStorage.getItem('sessionId')).toBe('fresh-session');
 });
 it('does not discard a bearer during ordinary user hydration',()=>{
  localStorage.setItem('authToken','current-test-token');
  useAuthStore().setAuth(null,{id:1,role:'client_guardian'});
  expect(localStorage.getItem('authToken')).toBe('current-test-token');
 });
 it('ignores a delayed lock response from the prior login',async()=>{
  localStorage.setItem('sessionId','old-session');
  const config=api.interceptors.request.handlers[0].fulfilled({method:'get',url:'/guardian-portal/overview',headers:{},skipGlobalLoading:true});
  localStorage.setItem('sessionId','new-session');
  const event=vi.fn();window.addEventListener('pt:session-security',event);
  const error={config,response:{status:423,data:{error:{code:'SESSION_LOCKED'},session:{phase:'timedown'}}}};
  await expect(api.interceptors.response.handlers[0].rejected(error)).rejects.toBe(error);
  expect(event).not.toHaveBeenCalled();window.removeEventListener('pt:session-security',event);
 });
 it('still honors a lock response belonging to the current session',async()=>{
  localStorage.setItem('sessionId','same-session');
  const event=vi.fn();window.addEventListener('pt:session-security',event);
  const error={config:{url:'/guardian-portal/overview',__authSessionId:'same-session'},response:{status:423,data:{error:{code:'SESSION_LOCKED'},session:{phase:'timedown'}}}};
  await expect(api.interceptors.response.handlers[0].rejected(error)).rejects.toBe(error);
  expect(event).toHaveBeenCalledOnce();window.removeEventListener('pt:session-security',event);
 });
});
