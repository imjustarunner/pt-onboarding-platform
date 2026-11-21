import DOMPurify from 'dompurify';

export function prepareEmailPreview(value, { openLinks = false } = {}) {
  const source = String(value || '');
  const isHtml = /<(?:!doctype|[a-z][a-z0-9]*)(?:\s|\/?>)/i.test(source);
  if (!isHtml) return { html: '', text: source };
  const clean=DOMPurify.sanitize(source, { FORBID_TAGS:['form','input','button','iframe','script','style','link','meta','base'], ADD_ATTR:['target'] });
  const document=new DOMParser().parseFromString(clean,'text/html');
  for (const link of document.querySelectorAll('a')) {
    if (openLinks) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('href');
    }
  }
  // Remote images remain blocked; avoid displaying broken-image placeholders.
  for(const img of document.querySelectorAll('img')) {
    if (!String(img.getAttribute('src') || '').startsWith('data:')) img.remove();
  }
  // Branded signatures reserve columns for remote logos/icons. With those
  // images blocked, empty columns must not squeeze contact text on a phone.
  for(const cell of document.querySelectorAll('[data-pt-staff-signature] td')) {
    if(!cell.textContent.trim()&&!cell.querySelector('img'))cell.style.display='none';
  }
  const body = document.body.innerHTML;
  for (const element of document.querySelectorAll('br, p, h1, h2, h3, h4, div, li, tr, blockquote')) {
    element.after(document.createTextNode('\n'));
  }
  const plainText = document.body.textContent.replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, '\n\n').trim();
  const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><style>body{font:16px/1.5 system-ui;margin:0;padding:12px;overflow-wrap:anywhere}table{max-width:100%!important}img{max-width:100%;height:auto}a{color:#1659a4}@media(max-width:600px){[data-pt-staff-signature]>table:first-child>tbody>tr>td:not([style*="display: none"]){display:block;width:auto!important;border-left:0!important;padding:4px 0!important;text-align:left!important}}</style>'+body;
  return { html, text: plainText };
}
