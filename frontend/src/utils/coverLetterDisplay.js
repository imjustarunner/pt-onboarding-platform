/**
 * Turn stored cover-letter text (plain, HTML, or a single run-on block) into
 * display paragraphs so line breaks from the application form are preserved.
 */
export function coverLetterParagraphs(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  let text = s;
  if (/<[a-z][\s\S]*>/i.test(s)) {
    text = s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"');
  }
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  const byBlank = text.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const byLine = text.split(/\n/).map((p) => p.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  if (text.length < 280) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let buf = '';
  for (const sentence of sentences) {
    const next = `${buf}${sentence}`.trim();
    if (buf && next.length > 220) {
      chunks.push(buf.trim());
      buf = sentence;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [text];
}
