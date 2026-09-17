import {describe,it,expect,vi,afterEach} from 'vitest';
import {createWebsiteTranslator} from '../publicWebsiteTranslation';
let translator;
afterEach(()=>{translator?.stop();document.body.innerHTML='';localStorage.clear();vi.useRealTimers();});
const pause=async()=>{await vi.advanceTimersByTimeAsync(100);};
describe('public website translation',()=>{
 it('translates join, provider, and careers labels and placeholders without changing selected filter values',async()=>{
  vi.useFakeTimers();document.body.innerHTML='<div class="ajl"><a>← Back to website</a><input placeholder="Search" value="Private client text"></div><div class="provider-profile"><select><option>English</option><option>Spanish</option></select></div><div class="cr"><h1>Careers</h1></div>';
  const translate=vi.fn(async()=>({translations:{},configured:true}));translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);await pause();
  expect(document.querySelector('input').placeholder).toBe('Buscar');expect(document.querySelector('input').value).toBe('Private client text');expect(document.querySelector('select').value).toBe('English');expect(document.querySelector('option').textContent).toBe('Inglés');expect(document.querySelector('.cr h1').textContent).toBe('Empleo');expect(translate.mock.calls.flat(2)).not.toContain('Private client text');
  translator.setSpanish(false);expect(document.querySelector('input').placeholder).toBe('Search');expect(document.querySelector('option').textContent).toBe('English');
 });
 it('translates public copy, restores English, and leaves form values and editor controls intact',async()=>{
  vi.useFakeTimers();document.body.innerHTML='<main class="mh-site"><h1>Home</h1><p class="mh-editor-content">New public copy</p><input value="Private form value"><div class="page-editor">Editor English</div><a href="/p/mh4kidz">About</a></main>';
  const translate=vi.fn(async strings=>({translations:Object.fromEntries(strings.map(s=>[s,'Texto público'])),configured:true}));
  translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);await pause();
  expect(document.querySelector('h1').textContent).toBe('Inicio');expect(document.querySelector('p').textContent).toBe('Texto público');expect(document.querySelector('input').value).toBe('Private form value');expect(document.querySelector('.page-editor').textContent).toBe('Editor English');expect(document.querySelector('a').getAttribute('href')).toBe('/p/mh4kidz');
  expect(translate.mock.calls.flat(2)).not.toContain('Private form value');translator.setSpanish(false);expect(document.querySelector('p').textContent).toBe('New public copy');expect(document.querySelector('h1').textContent).toBe('Home');
 });
 it('translates newly navigated content and does not overwrite a later English selection',async()=>{
  vi.useFakeTimers();document.body.innerHTML='<main class="range-site"><h1>Home</h1></main>';
  let resolve;const translate=vi.fn(()=>new Promise(r=>resolve=r));translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);await pause();
  document.querySelector('main').innerHTML='<h1>Services</h1><p>Dynamic content</p>';await pause();expect(document.querySelector('h1').textContent).toBe('Servicios');translator.setSpanish(false);resolve({configured:true,translations:{'Dynamic content':'Contenido dinámico'}});await pause();expect(document.querySelector('p').textContent).toBe('Dynamic content');
 });
 it('discloses unavailable translation and retries on request',async()=>{
  vi.useFakeTimers();document.body.innerHTML='<main class="rise-site"><p>Custom copy</p></main>';const state=vi.fn();const translate=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({translations:{'Custom copy':'Texto personalizado'},configured:true});translator=createWebsiteTranslator({document,translate,onState:state});translator.setSpanish(true);await pause();expect(state).toHaveBeenCalledWith('unavailable');translator.retry();await pause();expect(document.querySelector('p').textContent).toBe('Texto personalizado');
 });
});

it('saves Spanish copy across page visits and invalidates changed English copy',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<main class="itsco-site"><p>Saved public copy</p></main>';
 const translate=vi.fn(async strings=>({configured:true,translations:Object.fromEntries(strings.map(s=>[s,'Versión guardada']))}));
 translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);await pause();
 expect(translate).toHaveBeenCalledTimes(1);translator.stop();
 translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);
 expect(document.querySelector('p').textContent).toBe('Versión guardada');await pause();expect(translate).toHaveBeenCalledTimes(1);
 document.querySelector('p').textContent='Edited public copy';await pause();expect(translate).toHaveBeenCalledTimes(2);
});
it('reveals a Spanish page together and excludes private editor content',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<main class="itsco-site"><h1>Home</h1>'+Array.from({length:20},(_,i)=>`<p>Copy ${i}</p>`).join('')+'<div class="public-profile-editor">Private editor value</div></main>';
 let resolve;const translate=vi.fn(()=>new Promise(r=>resolve=r));translator=createWebsiteTranslator({document,translate});translator.setSpanish(true);await pause();
 expect(document.querySelector('main').style.visibility).toBe('hidden');expect(translate).toHaveBeenCalledTimes(1);expect(translate.mock.calls[0][0]).toHaveLength(20);
 resolve({configured:true,translations:Object.fromEntries(Array.from({length:20},(_,i)=>[`Copy ${i}`,`Texto ${i}`]))});await pause();
 expect(document.querySelector('main').style.visibility).toBe('');expect(document.querySelectorAll('p')[19].textContent).toBe('Texto 19');expect(document.querySelector('.public-profile-editor').textContent).toBe('Private editor value');
});
it('restores the visible English page immediately when switched during a pending request',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<main class="itsco-site"><p>Waiting for Spanish</p></main>';
 let resolve;translator=createWebsiteTranslator({document,translate:()=>new Promise(r=>resolve=r)});translator.setSpanish(true);await pause();translator.setSpanish(false);
 expect(document.querySelector('main').style.visibility).toBe('');resolve({translations:{'Waiting for Spanish':'Esperando'}});await pause();expect(document.querySelector('p').textContent).toBe('Waiting for Spanish');
});
