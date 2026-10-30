import { computed, inject } from 'vue';
import defaultApi from '../services/api';
import { useAuthStore } from '../store/auth';
export const SUBMIT_CONTEXT = Symbol('submitContext');

/** A component-local client: never changes login state or the shared API client. */
export function createSubmitApi(context, client = defaultApi) {
  const request = config => {
    let [url, search = ''] = config.url.split('?');
    const query = {};
    for (const [key, value] of new URLSearchParams(search)) {
      if (key in query) query[key] = [].concat(query[key], value);
      else query[key] = value;
    }
    const prefix = `/payroll/submit-for/${context.employee.id}`;
    if (url.startsWith('/payroll/me/')) url = prefix + url.slice('/payroll/me'.length);
    else if (url === '/payroll/my-time-categories') url = prefix + '/my-time-categories';
    else if (url.startsWith('/payroll/pay-system/')) url = prefix + url.slice('/payroll'.length);
    else if (url.startsWith('/me/company-events/')) url = prefix + url.slice('/me'.length);
    else if (url.startsWith('/availability/me/') || url === '/availability/school-requests' || url.startsWith('/company-car/') || url.startsWith('/team-meetings/manual-log')) url = prefix + url;
    else if (/^\/budget\/agencies\/\d+\/expenses$/.test(url)) url = prefix + '/budget/expenses';
    return client.request({ ...config, url, params:{ ...query, ...config.params, agencyId:context.agencyId } });
  };
  return {
    request,
    get:(url,config={})=>request({...config,method:'get',url}),
    delete:(url,config={})=>request({...config,method:'delete',url}),
    post:(url,data,config={})=>request({...config,method:'post',url,data}),
    put:(url,data,config={})=>request({...config,method:'put',url,data}),
    patch:(url,data,config={})=>request({...config,method:'patch',url,data})
  };
}
export function useSubmitContext() { return inject(SUBMIT_CONTEXT, null); }
export function useSubmitApi() {
  const context = useSubmitContext();
  return context ? createSubmitApi(context) : defaultApi;
}
export function useSubmitUser() {
  const context = useSubmitContext(), auth = useAuthStore();
  return computed(() => context?.employee || auth.user);
}
