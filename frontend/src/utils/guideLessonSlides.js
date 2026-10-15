import DOMPurify from 'dompurify';

// Keep the supplied edition's wording, links and order. Pagination is presentational;
// the saved learning record still refers to the original section, never a summary.
export function sectionScreens(html) {
  const clean = DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const blocks = [];
  for (const node of doc.body.childNodes) {
    if (!node.textContent?.trim() && !node.querySelector?.('img')) continue;
    if (['UL', 'OL'].includes(node.tagName) && node.children.length > 3) {
      for (let i = 0; i < node.children.length; i += 3) {
        const list = node.cloneNode(false);
        if (node.tagName === 'OL') list.setAttribute('start', String((Number(node.getAttribute('start')) || 1) + i));
        [...node.children].slice(i, i + 3).forEach(li => list.appendChild(li.cloneNode(true)));
        blocks.push({ html: list.outerHTML, length: list.textContent.length });
      }
    } else blocks.push({ html: node.outerHTML || DOMPurify.sanitize(node.textContent), length: node.textContent.length, heading: /^H[1-6]$/.test(node.tagName) });
  }
  const pages = []; let page = '', length = 0, lastHeading = false;
  for (const block of blocks) {
    if (page && !lastHeading && (length + block.length > 1000 || (block.heading && length > 450))) { pages.push(page); page = ''; length = 0; }
    page += block.html; length += block.length; lastHeading = block.heading;
  }
  if (page) pages.push(page);
  return pages.length ? pages : ['<p>Open the guide to review this section.</p>'];
}
export function buildGuideSlides(lesson) {
  const slides = [], placed = new Set();
  const questions = lesson.definition.questions;
  for (const [topicIndex, slug] of lesson.definition.requiredSections.entries()) {
    const section = lesson.book.sections.find(s => s.slug === slug);
    const presentation = lesson.definition.lessonPresentation?.[slug] || {};
    const escape = text => { const el = document.createElement('p'); el.textContent = text; return el.outerHTML; };
    const customFacts = presentation.facts?.filter(text => text.trim());
    const pages = sectionScreens(customFacts?.length ? customFacts.map(escape).join('') : section?.body_html);
    pages.forEach((html, index) => slides.push({ id: `${slug}:${index}`, kind: 'read', slug, title: presentation.title || section?.title || slug, presentation, html, part: index + 1, parts: pages.length, last: index === pages.length - 1, topicIndex }));
    questions.forEach((question, index) => {
      if (question.sourceSlug === slug) { slides.push({ id: question.id, kind: 'scenario', question, questionIndex: index, slug, title: presentation.title || section?.title || slug, presentation, topicIndex }); placed.add(question.id); }
    });
  }
  questions.forEach((question, index) => { if (!placed.has(question.id)) slides.push({ id: question.id, kind: 'scenario', question, questionIndex: index, slug: question.sourceSlug, title: 'Put it into practice', topicIndex: index }); });
  slides.push({ id: 'finish', kind: 'finish', title: 'Bring it into your work' });
  return slides;
}
export function firstUnfinishedSlide(slides, lesson) {
  const answered = new Set((lesson.reflections || []).map(f => f.id));
  return Math.max(0, slides.findIndex(s => s.kind === 'read' ? !lesson.readSections.includes(s.slug) : s.kind === 'scenario' ? !answered.has(s.question.id) : true));
}
export function lessonVisual(slide) {
  if (slide?.presentation?.imageUrl) return { url: slide.presentation.imageUrl, alt: slide.presentation.imageAlt || 'Lesson illustration', label: 'Your learning journey', credit: 'Lesson image' };
  const words = `${slide?.title || ''} ${slide?.slug || ''}`.toLowerCase();
  if (/scope|conduct|consent|guardian|listening|rapport|conversation|care-role|boundar/.test(words)) return { url: '/assets/rise/therapy.webp', alt: 'Illustrative scene of a professional listening during a conversation.', credit: 'Illustrative scene · From our image library', label: 'People & practice' };
  if (/document|note|record|billing|coding|time/.test(words)) return { url: '/assets/rise/coaching.webp', alt: 'Balanced stones overlooking a mountain lake.', credit: 'Illustrative scene · From our image library', label: 'Clarity & care' };
  return { url: '/assets/rise/in-person.webp', alt: 'A sunlit path through a forest toward the mountains.', credit: 'Illustrative scene · From our image library', label: 'Your next step' };
}

export function lessonFacts(html) {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html || ''), 'text/html');
  const facts = []; let heading = '';
  for (const node of doc.body.childNodes) {
    if (!node.textContent?.trim() && !node.querySelector?.('img')) continue;
    if (/^H[1-6]$/.test(node.tagName)) { heading += node.outerHTML; continue; }
    if (['OL', 'UL'].includes(node.tagName)) {
      [...node.children].forEach((li, i) => {
        const list = node.cloneNode(false);
        if (node.tagName === 'OL') list.setAttribute('start', String((Number(node.getAttribute('start')) || 1) + i));
        list.appendChild(li.cloneNode(true)); facts.push(heading + list.outerHTML); heading = '';
      });
    } else { facts.push(heading + (node.outerHTML || DOMPurify.sanitize(node.textContent))); heading = ''; }
  }
  if (heading) facts.push(heading);
  return facts;
}
