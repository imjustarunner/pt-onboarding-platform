import {
  PLOTLINE_LEGAL_ORIGIN,
  PLOTLINE_LEGAL_UPDATED,
  plotlineInterviewOptInScript,
  plotlineLegalPages
} from '../content/plotlineLegal.js';

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const policyLinks = [['privacy', 'Privacy policy'], ['terms', 'Terms & conditions'], ['sms-consent', 'Interview text consent']];
const link = (path, label) => '<a href="' + PLOTLINE_LEGAL_ORIGIN + '/' + path + '">' + escapeHtml(label) + '</a>';
const paragraph = value => '<p>' + escapeHtml(value)
  .replaceAll(PLOTLINE_LEGAL_ORIGIN + '/privacy', link('privacy', PLOTLINE_LEGAL_ORIGIN + '/privacy'))
  .replaceAll(PLOTLINE_LEGAL_ORIGIN + '/terms', link('terms', PLOTLINE_LEGAL_ORIGIN + '/terms'))
  .replaceAll('Support@plottwistco.com', '<a href="mailto:Support@plottwistco.com">Support@plottwistco.com</a>')
  .replaceAll('HQ@plottwistco.com', '<a href="mailto:HQ@plottwistco.com">HQ@plottwistco.com</a>') + '</p>';

export function renderPlotlineLegalHtml(key) {
  const page = plotlineLegalPages[key];
  if (!page) throw new Error('Unknown Plotline legal page');
  const canonical = PLOTLINE_LEGAL_ORIGIN + '/' + key;
  const navigation = policyLinks.map(([path, label]) => link(path, label)).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escapeHtml(page.title) + ' | Plotline by PlotTwistCo</title><meta name="description" content="' + escapeHtml(page.description) + '">'
    + '<link rel="canonical" href="' + canonical + '"><meta property="og:type" content="website"><meta property="og:site_name" content="Plotline by PlotTwistCo">'
    + '<meta property="og:title" content="' + escapeHtml(page.title) + '"><meta property="og:description" content="' + escapeHtml(page.description) + '"><meta property="og:url" content="' + canonical + '">'
    + '<link rel="icon" type="image/png" href="/assets/plotline/website/brand/logos/favicon-32.png">'
    + '<style>*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}body{margin:0;background:#faf8f4;color:#19382e;font:17px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#155d45;text-underline-offset:3px;overflow-wrap:anywhere}a:hover{color:#0f2d24}a:focus-visible{outline:3px solid #b89442;outline-offset:4px}.skip{position:absolute;top:-80px;left:20px;background:#fff;padding:12px;z-index:2}.skip:focus{top:12px}.wrap{max-width:1120px;margin:auto;padding:0 28px}header{border-bottom:1px solid #dcded5;background:#fff}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-top:18px;padding-bottom:18px}.brand{display:inline-flex;flex-shrink:0}.brand img{width:158px;height:auto;display:block}header nav,footer nav{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:.88rem}main{display:grid;grid-template-columns:220px minmax(0,1fr);gap:52px;padding-top:54px!important;padding-bottom:64px!important}aside{align-self:start;position:sticky;top:24px;font-size:.88rem;border-left:3px solid #c3aa70;padding-left:18px}aside strong{display:block;margin-bottom:12px}aside a{display:block;margin-bottom:10px;text-decoration:none}article{min-width:0}.eyebrow{font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:#6d623c;margin:0 0 12px}h1{font-size:clamp(2rem,4vw,3.1rem);line-height:1.15;letter-spacing:-.035em;margin:0 0 20px;color:#0f2d24}h2{font-size:1.3rem;line-height:1.35;margin:0 0 14px;color:#0f2d24}p{margin:0 0 18px}.date{font-size:.88rem;color:#55665c}.intro{font-size:1.1rem}.download{display:inline-block;margin:4px 0 24px;padding:10px 16px;background:#edf2e9;border:1px solid #cbd6c4;border-radius:8px}section{border-top:1px solid #dedfd7;padding-top:28px;margin-top:30px}footer{border-top:1px solid #dcded5;background:#f0f0e8;padding:30px 0;font-size:.88rem}footer p{margin:16px 0 0}footer .support{margin-bottom:8px}@media(max-width:760px){header .wrap{align-items:flex-start;flex-direction:column;gap:16px}.wrap{padding-left:22px;padding-right:22px}main{display:block;padding-top:32px!important}aside{position:static;margin-bottom:32px}aside a{margin-bottom:7px}h1{font-size:2.15rem}header nav{gap:10px 18px}}@media print{body{background:white;color:black;font-size:11pt}header,aside,.download,footer,.skip{display:none}main{display:block;padding:0!important}.wrap{max-width:none;padding:0}h1{font-size:25pt}h2{break-after:avoid}p{orphans:3;widows:3}a{color:inherit}section{margin-top:20px;padding-top:20px}}</style></head><body>'
    + '<a class="skip" href="#main">Skip to content</a><header><div class="wrap"><a class="brand" href="' + PLOTLINE_LEGAL_ORIGIN + '"><img src="/assets/plotline/website/brand/logos/plotline-primary-transparent.webp" alt="Plotline by PlotTwistCo" width="158" height="63"></a><nav aria-label="Plotline policies">' + navigation + '</nav></div></header>'
    + '<main class="wrap" id="main"><aside aria-label="On this page"><strong>On this page</strong>' + page.sections.map(item => '<a href="#' + item.id + '">' + escapeHtml(item.title) + '</a>').join('') + '</aside>'
    + '<article><p class="eyebrow">Plotline People Operations</p><h1>' + escapeHtml(page.title) + '</h1><p class="date">Effective ' + PLOTLINE_LEGAL_UPDATED + '</p><p class="intro">' + escapeHtml(page.intro) + '</p>'
    + (key === 'sms-consent' ? '<a class="download" href="' + PLOTLINE_LEGAL_ORIGIN + '/sms-consent.txt">Open the full script as a text file</a>' : '')
    + page.sections.map(item => '<section id="' + item.id + '"><h2>' + escapeHtml(item.title) + '</h2>' + item.paragraphs.map(paragraph).join('') + '</section>').join('')
    + '</article></main><footer><div class="wrap"><nav aria-label="Policy links">' + navigation + '</nav><p class="support">Questions? <a href="mailto:Support@plottwistco.com">Support@plottwistco.com</a> · <a href="tel:+18337568894">833-756-8894</a></p><p>Plotline is a product of Plot Twist Co. <a href="' + PLOTLINE_LEGAL_ORIGIN + '">Return to Plotline</a></p></div></footer></body></html>';
}

export function renderPlotlineOptInText() {
  return ['Plotline People Operations', 'Interview Text Reminder Opt-In Script', 'Effective ' + PLOTLINE_LEGAL_UPDATED,
    plotlineLegalPages['sms-consent'].intro, plotlineLegalPages['sms-consent'].sections[0].paragraphs[0],
    ...plotlineInterviewOptInScript, 'Privacy policy ' + PLOTLINE_LEGAL_ORIGIN + '/privacy',
    'Terms & conditions ' + PLOTLINE_LEGAL_ORIGIN + '/terms', 'Support Support@plottwistco.com | 833-756-8894', ''].join('\n\n');
}
