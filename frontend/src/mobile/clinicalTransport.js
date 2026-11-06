import axios from 'axios';

/** Keep clinical calls on the retained mobile session, never a desktop login. */
export function mobileClinicalClient(apiBase, sessionToken) {
  const config = value => ({ ...value, withCredentials:true, headers:{ ...value?.headers, 'X-Quick-View-Session':sessionToken } });
  return {
    get:(path,options) => axios.get(`${apiBase}/clinical${path}`,config(options)),
    post:(path,body,options) => axios.post(`${apiBase}/clinical${path}`,body,config(options)),
    patch:(path,body,options) => axios.patch(`${apiBase}/clinical${path}`,body,config(options))
  };
}
