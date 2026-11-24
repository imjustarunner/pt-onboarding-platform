import {referenceEmailFrame} from './hiringReferenceEmail.service.js';
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function plotlineSupportEmail(body){
  return {
    text:`${body}\n\nPlotline Support · Operated by PlotTwistCo\nhttps://plotlinepo.com/support`,
    html:referenceEmailFrame({agency:{name:'PlotTwistCo',logo_url:'https://plotlinepo.com/email-signatures/staff-html/plottwistco-mark.png?v=6'},departmentLabel:'PLATFORM SUPPORT',heading:'A reply from Plotline Support',marketing:false,
      body:`<div style="white-space:pre-wrap">${escape(body)}</div><p>Plotline — A People Operations Platform. Operated by PlotTwistCo.</p><p><a href="https://plotlinepo.com/support">Contact Plotline Support</a></p>`})
  };
}
