import api from './api';
import { availabilityDate, availabilityMonday, addAvailabilityDays } from '../utils/providerAvailabilityWeek';

// Public published openings only. Never store holds, enrollment, or client data.
export const DIRECTORY_REFRESH_MS = 5 * 60 * 1000;
export const PROVIDER_REFRESH_MS = 60 * 1000;
const retention = 24 * 60 * 60 * 1000;
const memory = new Map(), pending = new Map();
const keyFor = parts => 'public-availability-v1:' + JSON.stringify(parts);
function cached(key) {
  let entry;
  try { entry = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { entry=memory.get(key); }
  return entry && Number.isFinite(entry.at) && Date.now() - entry.at < retention ? entry : null;
}
function save(key, data) {
  const entry = { at:Date.now(), data };
  try { sessionStorage.setItem(key, JSON.stringify(entry)); memory.delete(key); } catch {
    memory.delete(key); memory.set(key,entry);
    if(memory.size>100)memory.delete(memory.keys().next().value);
  }
  return data;
}
function read(key, ttl, load, force) {
  const entry = cached(key);
  if (!force && entry && Date.now() - Math.min(entry.at,Date.parse(entry.data?.checkedAt)||entry.at) < ttl) return Promise.resolve(structuredClone(entry.data));
  if (!pending.has(key)) {
    const job = load().then(data => save(key, data)).finally(() => { if (pending.get(key) === job) pending.delete(key); });
    pending.set(key, job);
  }
  return pending.get(key).then(data => structuredClone(data));
}
const providerKey = ({agencySlug, providerId, serviceType='counseling'}) => [agencySlug, Number(providerId), serviceType];
const weekKey = options => keyFor(['week', ...providerKey(options), options.weekStart]);
export function getProviderTimeZone(options) { return cached(keyFor(['zone', ...providerKey(options)]))?.data || 'America/Denver'; }
export function providerWeekStarts(options, now=Date.now()) {
  const start = availabilityMonday(availabilityDate(now, getProviderTimeZone(options)));
  return Array.from({length:4}, (_, i) => addAvailabilityDays(start, i*7));
}
export function getCachedProviderWeek(options) { const data=cached(weekKey(options))?.data; return data ? structuredClone(data) : null; }
export function readProviderWeek(options, {force=false}={}) {
  const {agencySlug, providerId, serviceType='counseling', weekStart} = options;
  return read(weekKey(options), PROVIDER_REFRESH_MS, async () => {
    const {data} = await api.get(`/public/agency-services/${encodeURIComponent(agencySlug)}/providers/${Number(providerId)}/schedule-summary`, {
      params:{serviceType,weekStart}, skipAuthRedirect:true, skipGlobalLoading:true, timeout:60000
    });
    if (data.weekStart !== weekStart) throw new Error('Weekly availability is updating. Please try again shortly.');
    if (data.timeZone) save(keyFor(['zone', ...providerKey(options)]), data.timeZone);
    return data;
  }, force);
}
export function mergeProviderWeeks(weeks) {
  const values = weeks.filter(Boolean);
  if (!values.length) return null;
  const newest = [...values].sort((a,b)=>Date.parse(b.checkedAt||0)-Date.parse(a.checkedAt||0))[0];
  const slots = [...new Map(values.flatMap(data=>data.slots||[]).filter(slot=>Date.parse(slot.startAt)>Date.now())
    .map(slot=>[[slot.format,slot.startAt,slot.endAt,slot.buildingId,slot.frequency,slot.purpose].join(':'),slot])).values()].sort((a,b)=>a.startAt.localeCompare(b.startAt));
  const result = {...newest, slots, loadedWeeks:values.map(data=>data.weekStart), nextAvailableAt:slots[0]?.startAt||null};
  for (const [key,format] of [['inPerson','IN_PERSON'],['virtual','VIRTUAL']]) {
    const status=values.some(data=>data[key]?.status==='accepting')?'accepting':values.some(data=>data[key]?.status==='waitlist')?'waitlist':'unavailable';
    const next=slots.find(slot=>slot.format===format);
    result[key]={...newest[key],status,hasPublishedOpenings:Boolean(next),nextAvailableAt:next?.startAt||null};
  }
  result.hasPublishedOpenings=Boolean(slots.length || newest.school?.hasPublishedOpenings);
  result.waitlistFormats=[...new Set(values.flatMap(data=>data.waitlistFormats||[]))];
  result.checkedAt=values.map(data=>data.checkedAt).filter(Boolean).sort()[0] || null;
  return result;
}
const directoryParams = query => Object.fromEntries(['officeId','day','timeFrom','timeTo'].filter(key=>query?.[key]).map(key=>[key,String(query[key])]));
const directoryKey = (agencySlug,query) => keyFor(['directory',agencySlug,directoryParams(query)]);
export function getCachedDirectoryAvailability(agencySlug,query={}) {
  const data=cached(directoryKey(agencySlug,query))?.data;
  return data ? pruneDirectoryAvailability(structuredClone(data)) : null;
}
export function pruneDirectoryAvailability(data) {
  for (const provider of Object.values(data.providers)) {
    for (const format of ['inPerson','virtual']) {
      if (!provider[format]) continue;
      const value=provider[format]; value.slots=(value.slots||[]).filter(slot=>Date.parse(slot.startAt)>Date.now());
      value.nextAvailableAt=value.slots[0]?.startAt || (Date.parse(value.nextAvailableAt)>Date.now()?value.nextAvailableAt:null);
      value.hasPublishedOpenings=Boolean(value.nextAvailableAt);
    }
    provider.nextAvailableAt=[provider.inPerson?.nextAvailableAt,provider.virtual?.nextAvailableAt].filter(Boolean).sort()[0]||null;
    provider.hasPublishedOpenings=Boolean(provider.nextAvailableAt);
  }
  return data;
}
export async function readDirectoryAvailability(agencySlug,query={}, {force=false}={}) {
  const data=await read(directoryKey(agencySlug,query), DIRECTORY_REFRESH_MS, async () => {
    const responses=await Promise.all(['IN_PERSON','VIRTUAL'].map(programType=>api.get(`/public/agency-services/${encodeURIComponent(agencySlug)}/counselors`, {
      params:{...directoryParams(query),programType,view:'availability'},skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000
    })));
    const providers={},checks=[];
    responses.forEach((response,index)=>{
      for (const provider of response.data.providers||[]) {
        const value=provider.availability||{},id=provider.id||provider.providerId;
        providers[id]??={timeZone:value.timeZone||'America/Denver'};
        providers[id][index===0?'inPerson':'virtual']={nextAvailableAt:value.nextAvailableAt||null,slots:value.upcomingSlots?.length?value.upcomingSlots:value.slots||[]};
        if(value.checkedAt)checks.push(value.checkedAt);
      }
    });
    return {providers,checkedAt:checks.sort()[0]||null};
  },force);
  return pruneDirectoryAvailability(data);
}
