import axios from 'axios';
// Deliberately independent from the platform auth store and its JWT interceptors.
export const directoryApi = axios.create({baseURL:`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/provider-directories`,withCredentials:false});
export const sessionKey = slug => `provider-directory:${slug}`;
export const sessionToken = slug => sessionStorage.getItem(sessionKey(slug)) || '';
export const rememberSession = (slug,token) => token ? sessionStorage.setItem(sessionKey(slug),token) : sessionStorage.removeItem(sessionKey(slug));
export const directoryRequest = async (slug,path='',method='get',data) => (await directoryApi.request({url:`/${encodeURIComponent(slug)}${path}`,method,data,headers:{'X-Directory-Session':sessionToken(slug)}})).data;
export const STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' ');
export const HERITAGES=['Hispanic','Latino','Latina','Latinx','Latine','Hispanic / Latino'];
export const LANGUAGES=['English','Spanish','Portuguese','French','American Sign Language','Arabic','Mandarin','Cantonese','Vietnamese','Korean','Tagalog','Russian','German','Italian','Haitian Creole','Indigenous languages'];
export const INSURANCES=['Self-pay','Sliding scale','Aetna','Anthem / Blue Cross Blue Shield','Cigna','UnitedHealthcare','Optum','Medicaid','Medicare','TRICARE','Out-of-network'];
