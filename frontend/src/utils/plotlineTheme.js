export const plotlineThemes=Object.freeze([
 {id:'clarity',name:'Clarity',description:'Montserrat · Clean & structured',body:'Montserrat',heading:'Montserrat',radius:'12px'},
 {id:'studio',name:'Studio',description:'Sora + Inter · Open & welcoming',body:'Plotline Inter',heading:'Plotline Sora',radius:'24px'},
 {id:'story',name:'Story',description:'Editorial serif · Thoughtful & clear',body:'Plotline Inter',heading:'Georgia',radius:'4px'}
]);
const hex=value=>/^#[0-9a-f]{6}$/i.test(String(value))?value:'#205846';
function luminance(color){return color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
export function plotlineThemeStyle(brand={}){
 const theme=plotlineThemes.find(t=>t.id===brand.theme)||plotlineThemes[0],primary=hex(brand.primary||'#205846'),accent=hex(brand.accent||'#DCAA73');
 return {'--pl-company-primary':primary,'--pl-company-accent':accent,'--pl-company-on-primary':luminance(primary)>.179?'#000000':'#FFFFFF',
  '--primary':primary,'--primary-color':primary,'--accent':accent,'--accent-color':accent,
  '--pl-company-heading-color':luminance(primary)<.16?primary:'#0F2D24','--pl-company-body':`"${theme.body}",sans-serif`,'--pl-company-heading':`"${theme.heading}",serif`,'--pl-company-radius':theme.radius};
}
// An email token survives SPA sign-in navigation only in memory. It never enters
// browser storage, analytics, redirects, query parameters or an application JWT.
let verificationToken='';
export function takePlotlineToken(hash){const found=new URLSearchParams(String(hash||'').replace(/^#/, '')).get('token');if(found)verificationToken=found;return verificationToken;}
export function clearPlotlineToken(){verificationToken='';}
