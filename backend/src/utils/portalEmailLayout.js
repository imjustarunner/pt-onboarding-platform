// Final sender footers (SchoolCareBridge and compliance) must share the portal
// card's width. Move content appended after </html> back inside the document.
export function constrainPortalEmailLayout(html) {
  if (!/data-portal-email="v[12]"/.test(String(html || ''))) return html;
  const match = String(html).match(/^([\s\S]*?<body\b[^>]*>)([\s\S]*?)<\/body>\s*<\/html>([\s\S]*)$/i);
  if (!match) return html;
  return `${match[1]}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;table-layout:fixed"><tr><td style="overflow-wrap:anywhere;word-break:break-word">${match[2]}${match[3]}</td></tr></table></td></tr></table></body></html>`;
}
