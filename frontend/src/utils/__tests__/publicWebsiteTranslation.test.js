import {describe,it,expect,vi,afterEach} from 'vitest';
import {createWebsiteTranslator} from '../publicWebsiteTranslation';
let translator;
afterEach(()=>{translator?.stop();document.body.innerHTML='';vi.useRealTimers();});
const pause=async()=>{await vi.advanceTimersByTimeAsync(100);};
describe('public website translation',()=>{
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
