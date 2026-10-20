import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SKILL_BUILDERS_BASE, SKILL_BUILDERS_ORIGIN, SKILL_BUILDERS_ENROLLMENT, skillBuildersPages as pages, skillBuildersDomains as domains, skillBuildersSteps as steps, skillBuildersFaqs as faqs, skillBuildersPath as path } from '../src/content/skillBuildersWebsite.js';

const out = fileURLToPath(new URL('../public/skillbuilders/', import.meta.url));
const assets = '/assets/skillbuilders';
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const arrow = '<span aria-hidden="true">→</span>';
const iconPaths = {
  puzzle: '<path d="M9 3h5a4 4 0 1 0 8 0h5v11a4 4 0 1 1 0 8v11H17a4 4 0 1 0-8 0H3V22a4 4 0 1 0 0-8V3z"/>',
  sprout: '<path d="M18 33V19M18 25C3 25 3 12 3 7c14 0 15 12 15 12M18 20C18 6 27 3 33 3c0 13-5 19-15 17"/>',
  heart: '<path d="M25 33v-7h5v-8l3-2-5-6A12 12 0 0 0 5 15c0 7 5 9 5 13v5"/><path d="M17 13c-4-6-11 1 0 8 11-7 4-14 0-8z"/>',
  people: '<circle cx="18" cy="9" r="5"/><path d="M10 31v-9a8 8 0 0 1 16 0v9z"/><circle cx="5" cy="14" r="3"/><circle cx="31" cy="14" r="3"/><path d="M5 22H2v9h4m25-9h3v9h-4"/>',
  sun: '<circle cx="18" cy="18" r="7"/><path d="M18 1v5m0 24v5M1 18h5m24 0h5M6 6l4 4m16 16 4 4M6 30l4-4M26 10l4-4"/>',
  star: '<path d="m18 2 5 10 11 2-8 8 2 12-10-6-10 6 2-12-8-8 11-2z"/>',
  flag: '<path d="M18 20V2m0 1h14l-4 5 4 5H18M2 33l10-17 7 10 4-7 11 14z"/>',
  book: '<path d="M18 8C12 3 5 4 2 5v25c6-2 11-1 16 3 5-4 10-5 16-3V5c-4-1-10-2-16 3v25"/>',
  check: '<path d="m7 18 7 7L29 9"/>',
  mail: '<rect x="2" y="6" width="32" height="24" rx="4"/><path d="m3 8 15 12L33 8"/>',
  download: '<path d="M18 2v22m-8-8 8 8 8-8M4 25v8h28v-8"/>',
};
function icon(name, extra = '') { return `<svg class="icon ${extra}" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sprout}</svg>`; }
// Show the supplied artwork as clipped, accessible media. Text and controls remain native HTML.
const crops = {
  logo: ['about', '65 5 142 110'],
  tree: ['brand', '729 80 570 400'],
  together: ['about', '622 168 490 248'],
  friends: ['program', '45 539 293 164'],
  growth: ['program', '373 539 283 164'],
  calm: ['program', '694 539 284 164'],
  friendsPortrait: ['domains', '405 440 228 266'],
  growthPortrait: ['domains', '405 760 228 265'],
  calmPortrait: ['domains', '405 1079 228 249'],
  portrait: ['about', '23 431 344 332'],
  adventure: ['program', '690 1350 333 186']
};
function media(name, alt = '', className = '') {
  const [file, box] = crops[name];
  const width = ['program', 'domains'].includes(file) ? 1024 : 1312;
  const height = ['program', 'domains'].includes(file) ? 1536 : 1199;
  return `<svg class="art art-${name} ${className}" viewBox="${box}"${name.endsWith('Portrait') ? ' preserveAspectRatio="xMidYMid slice"' : ''} role="img" aria-label="${esc(alt)}"><image href="${assets}/${file}-reference.png" width="${width}" height="${height}"/></svg>`;
}
function button(label, href, style = '', extra = '') { return `<a class="button ${style}" href="${href}" ${extra}>${label}${arrow}</a>`; }
function waves() { return '<svg class="waves" viewBox="0 0 1440 94" preserveAspectRatio="none" aria-hidden="true"><path fill="#dcefc2" d="M0 25C230 150 390-15 655 58s385 35 785-25v61H0z"/><path fill="#ffd45b" d="M0 53C280 145 300 12 550 76s550 8 890-56v74H0z"/><path fill="#66c7c4" d="M610 94C860-30 1040 114 1180 52s195-10 260-25v67z"/><path fill="#00a7ac" d="M850 94c180-76 255 22 390-29s155-38 200-23v52z"/></svg>'; }
function nav(key, footer = false) {
  return Object.entries(pages).map(([id, p]) => `<a href="${path(id)}"${key === id ? ' aria-current="page"' : ''}>${p.label}</a>`).join('');
}
function header(key) {
  return `<a class="skip-link" href="#main">Skip to content</a>
  <header class="header"><div class="header-inner">
    <a class="brand" href="${path()}" aria-label="Skill Builders home">${media('logo', 'Skill Builders')}</a>
    <button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="main-nav"><span>Menu</span><span class="menu-lines" aria-hidden="true"></span></button>
    <nav id="main-nav" class="nav" aria-label="Main navigation">${nav(key)}${button('Get Started', path('contact'), 'yellow nav-mobile-cta')}</nav>
    ${button('Get Started', path('contact'), 'yellow header-cta')}
  </div></header>`;
}
function footer(key) {
  return `<footer class="footer"><div class="wrap footer-top"><a class="footer-brand" href="${path()}">${media('logo', 'Skill Builders')}<span><strong>SKILL BUILDERS</strong><small>Stronger Skills. Brighter Futures.</small></span></a><nav aria-label="Footer navigation">${nav(key, true)}</nav></div><div class="wrap footer-bottom"><span>A program from <a href="https://www.itsco.health">ITSCO</a></span><span><a href="https://www.itsco.health/itsco/privacypolicy">Privacy</a><a href="https://www.itsco.health/itsco/terms">Terms</a><span>© ${new Date().getFullYear()} ITSCO</span></span></div></footer>`;
}
function hero(eyebrow, title, description, home = false) {
  return `<section class="hero ${home ? 'hero-home' : ''}"><div class="wrap hero-layout"><div class="hero-copy"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${home ? '<p class="hero-tagline">Building Skills for Brighter Futures</p>' : ''}<p class="hero-description">${description}</p>${home ? `<div class="actions">${button('Explore the Program', path('program'))}${button('Our Story', path('about'), 'outline')}</div><div class="hero-note"><span></span>Real-life skills. Room to grow.</div>` : ''}</div><div class="hero-visual">${home ? media('tree', 'A colorful tree surrounded by leaves, puzzle pieces, and connected hands') : `<div class="photo-orbit">${media('together', 'Four children standing together with their arms around one another')}</div><span class="connection-note">Connection<br>Confidence<br>Resilience<br>Growth</span><span class="sun-doodle" aria-hidden="true">✳</span>`}</div></div>${waves()}</section>`;
}
function cta(title = 'A small step today.<br>A brighter tomorrow.', label = 'Get Started', href = path('contact')) {
  return `<section class="cta-band"><div class="wrap cta-layout"><div><p class="eyebrow">LET’S GROW TOGETHER</p><h2>${title}</h2><p>Help your child build skills that go beyond the classroom.</p></div>${button(label, href, 'yellow')}</div></section>`;
}
function domainCards(full = false) {
  return `<div class="domain-grid">${domains.map((d, i) => `<article class="domain-card ${d.color}">${full ? media(d.photo, ['Children talking and learning together', 'A child reflecting with a smile', 'A child taking a quiet moment'][i]) : ''}<div class="domain-card-content"><span class="icon-bubble">${icon(d.icon)}</span><p class="eyebrow">DOMAIN 0${i + 1}</p><h3>${d.name}</h3><p>${d.summary}</p>${full ? `<ul class="topic-checks">${d.topics.map(([name]) => `<li>${icon('check')}${name}</li>`).join('')}</ul>` : ''}${button(full ? 'Explore This Domain' : 'Discover This Domain', `${path('domains')}#${d.id}`, d.color)}</div></article>`).join('')}</div>`;
}
function process() {
  return `<section class="process-section" id="session-structure"><div class="wrap"><div class="section-heading"><p class="eyebrow">LEARNING THAT STAYS WITH YOU</p><h2>How the Program Works</h2><p>A structured, engaging approach to practicing skills in everyday life.</p></div><div class="steps">${steps.map(([i, title, body], n) => `<article><span class="step-icon ${['blue', 'yellow', 'green', 'teal'][n]}">${icon(i)}</span><span class="step-number">0${n + 1}</span><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></div></section>`;
}
function home() {
  return `${hero('A LITTLE SUPPORT. A LIFETIME OF POSSIBILITY.', 'SKILL <span>BUILDERS</span>', 'Helping children and young learners develop essential interpersonal skills, personal growth, and emotional well-being.', true)}
    <section class="section wrap"><div class="section-heading"><p class="eyebrow">CONNECTED SKILLS. CONFIDENT KIDS.</p><h2>Three Key Domains</h2><p>Three essential areas. One shared purpose: helping children thrive.</p></div>${domainCards()}</section>
    <section class="overview-strip"><div class="wrap overview-layout"><span class="overview-icon">${icon('book')}</span><div><p class="eyebrow">ROOM TO LEARN. SPACE TO GROW.</p><h2>A thoughtful path forward.</h2><p>Our program brings together engaging topics and activities to support children’s social, emotional, and personal development.</p>${button('View Full Program Outline', path('program'))}</div><ul>${domains.map(d => `<li class="${d.color}">${icon('check')}<span><strong>${d.name}</strong><small>${d.topics.length} topics to explore</small></span></li>`).join('')}</ul></div></section>
    <section class="section wrap real-life"><div class="real-life-photo">${media('portrait', 'A child looking ahead with a thoughtful smile')}<span class="photo-caption">Every small step matters.</span></div><div><p class="eyebrow">BEYOND THE CLASSROOM</p><h2>Practical skills.<br><span class="underline">Everyday possibilities.</span></h2><p>Making a new friend. Asking for help. Trying again when something feels hard. These are the moments Skill Builders is designed for.</p><p>Through activities, conversation, and reflection, children explore skills they can bring into school, relationships, and life.</p>${button('Meet Skill Builders', path('about'), 'outline')}</div></section>${cta()}`;
}
function about() {
  return `${hero('ABOUT SKILL BUILDERS', 'Stronger Skills.<br><span class="underline">Brighter Futures.</span>', 'A comprehensive program designed to help children and young learners develop essential interpersonal skills, personal growth, and emotional well-being.')}
    <section class="section wrap mission-layout"><div class="mission-photo">${media('portrait', 'A smiling child imagining what comes next')}</div>${[
      ['flag', 'Our Mission', 'To empower children and young learners with the skills, confidence, and resilience they need to build positive relationships, navigate challenges, and create brighter futures.'],
      ['sprout', 'Our Vision', 'A world where every child has the social, emotional, and personal skills to thrive in school, in relationships, and in life.'],
      ['people', 'Why It Matters', 'Everyday skills help children connect with others, understand themselves, and approach life’s challenges with growing confidence.']
    ].map(([i, t, b], n) => `<article><span class="icon-bubble ${['yellow', 'teal', 'green'][n]}">${icon(i)}</span><h2>${t}</h2><p>${b}</p><span class="handline ${['yellow', 'teal', 'green'][n]}"></span></article>`).join('')}</section>
    <section class="approach-section"><div class="wrap approach-layout"><div><p class="eyebrow">OUR APPROACH</p><h2>Practical Skills<br>for Real Life</h2><p>Skill Builders combines engaging activities, discussions, and reflective practice to help children apply skills in everyday situations, both in and outside the classroom.</p></div><div class="values-panel"><p class="eyebrow">OUR VALUES</p><div class="values-grid">${[['heart', 'Empowerment', 'Every child has the potential to grow and thrive.', 'yellow'], ['puzzle', 'Connection', 'Meaningful relationships create stronger communities.', 'teal'], ['sprout', 'Growth', 'Small steps lead to big changes.', 'green'], ['sun', 'Well-Being', 'A healthy mind and heart create a brighter future.', 'yellow']].map(([i,t,b,c]) => `<article><span class="icon-bubble ${c}">${icon(i)}</span><div><h3>${t}</h3><p>${b}</p></div></article>`).join('')}</div></div></div></section>${cta('See how the pieces<br>come together.', 'Explore the Program', path('program'))}`;
}
function program() {
  return `${hero('PROGRAM OVERVIEW', 'Building Skills for<br><span class="underline">Brighter Futures.</span>', 'A structured program that connects meaningful learning with opportunities to practice in everyday life.')}
    <nav class="section-nav wrap" aria-label="Program sections"><a class="active" href="#program-domains">Program Overview</a>${domains.map(d => `<a href="${path('domains')}#${d.id}">${d.name}</a>`).join('')}<a href="#session-structure">Session Structure</a></nav>
    <section class="section wrap" id="program-domains"><div class="section-heading"><p class="eyebrow">A FOUNDATION FOR WHAT’S NEXT</p><h2>Three Key Domains</h2><p>Explore 17 topics across three essential areas, with engaging, age-appropriate learning that supports real-life skills.</p></div>${domainCards(true)}</section>${process()}
    <section class="section wrap session-detail"><div><p class="eyebrow">FROM LEARNING TO DOING</p><h2>Practice. Reflect.<br>Try it in real life.</h2></div><div><p>Activities and guided conversations give children opportunities to explore a skill, practice with others, and reflect on what they notice.</p><p>Families and school teams can connect with us about the available programs, age groups, schedules, and enrollment details.</p>${button('Find a Program', SKILL_BUILDERS_ENROLLMENT, 'outline')}</div></section>
    <section class="guide-banner"><div class="wrap"><div><p class="eyebrow">TAKE A CLOSER LOOK</p><h2>Your guide to Skill Builders.</h2><p>Keep the three domains and full topic outline handy.</p><div class="actions">${button(`${icon('download')} Download Program Guide`, `${assets}/skill-builders-program-guide.pdf`, 'yellow', 'download')}${button('Contact Us', path('contact'), 'outline-light')}</div></div>${media('adventure', 'A child with a backpack raising their arms toward the mountains')}</div></section>`;
}
function domainPage() {
  return `${hero('PROGRAM DOMAINS', 'Three Domains.<br><span class="underline">Real-Life Skills.</span>', 'Skills for connection, confidence, resilience, and growth. Explore the three areas at the heart of Skill Builders.')}
    <nav class="section-nav wrap" aria-label="Jump to a domain">${domains.map(d => `<a href="#${d.id}">${d.name}</a>`).join('')}</nav>
    <section class="wrap domain-details">${domains.map((d, i) => `<article id="${d.id}" class="domain-detail ${d.color}"><div class="domain-intro"><div class="domain-title"><span class="icon-bubble">${icon(d.icon)}</span><div><p class="eyebrow">DOMAIN 0${i+1}</p><h2>${d.name}</h2></div></div><p>${d.description}</p>${button('Find a Program', SKILL_BUILDERS_ENROLLMENT, d.color)}</div><div class="domain-photo">${media(`${d.photo}Portrait`, ['Children sharing ideas', 'A child taking time to reflect', 'A child practicing a quiet moment'][i])}<span class="domain-photo-note">${['Better, together.', 'Room to grow.', 'A little more calm.'][i]}</span></div><div class="domain-topic-list"><p class="eyebrow">TOPICS WE EXPLORE</p><ul>${d.topics.map(([t,b]) => `<li><span>${icon('check')}</span><div><h3>${t}</h3><p>${b}</p></div></li>`).join('')}</ul></div></article>`).join('')}</section>${cta('The big picture.<br>One connected program.', 'View Program Overview', path('program'))}`;
}
function resources() {
  return `${hero('RESOURCES FOR THE JOURNEY', 'Keep the<br><span class="underline">Growth Going.</span>', 'Explore the program, find a starting point for everyday practice, and get answers to common questions.')}
    <section class="section wrap resource-download"><div class="guide-cover"><p>SKILL BUILDERS</p>${icon('sprout')}<h2>Small steps.<br>Brighter futures.</h2><span>YOUR PROGRAM GUIDE</span></div><div><p class="eyebrow">THE PROGRAM AT A GLANCE</p><h2>A guide you can<br>keep and share.</h2><p>Our program guide includes all three domains, the full 17-topic outline, and ideas for connecting learning to everyday life.</p>${button(`${icon('download')} Download Program Guide`, `${assets}/skill-builders-program-guide.pdf`, 'yellow', 'download')}<p class="fineprint">PDF · Program overview and topic outline</p></div></section>
    <section class="practice-section"><div class="wrap"><div class="section-heading"><p class="eyebrow">SMALL MOMENTS. MEANINGFUL PRACTICE.</p><h2>Try it Together</h2><p>Simple conversation starters to adapt with your child and program team.</p></div><div class="practice-grid">${domains.map(d => `<article class="${d.color}"><span class="icon-bubble">${icon(d.icon)}</span><p class="eyebrow">${d.name}</p><h3>${{yellow:'Make a plan, together.',teal:'Choose one small goal.',green:'Make space for feelings.'}[d.color]}</h3><p>${d.practice}</p></article>`).join('')}</div></div></section>
    <section class="section wrap faq-section"><div><p class="eyebrow">A LITTLE MORE CLARITY</p><h2>Good Questions.<br>Helpful Answers.</h2><p>Need something more specific?<br><a class="text-link" href="${path('contact')}">We’re here to help ${arrow}</a></p></div><div class="faqs">${faqs.map(([q,a]) => `<details><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section>${cta()}`;
}
function contact() {
  return `${hero('LET’S TAKE THE NEXT STEP', 'A Brighter Future<br><span class="underline">Starts Here.</span>', 'Find a program for your child or connect with our team about bringing Skill Builders to your school community.')}
    <section class="section wrap contact-grid"><article class="contact-card yellow"><span class="icon-bubble">${icon('people')}</span><p class="eyebrow">FOR FAMILIES</p><h2>Find your next step.</h2><p>Explore the Skill Builders program listing and connect with the team about current options, schedules, and enrollment.</p>${button('Find a Program', SKILL_BUILDERS_ENROLLMENT, 'yellow')}<p class="fineprint">Opens the ITSCO Skill Builders program listing.</p></article><article class="contact-card teal"><span class="icon-bubble">${icon('mail')}</span><p class="eyebrow">FOR FAMILIES & SCHOOLS</p><h2>Let’s talk possibilities.</h2><p>Have a question about the program or a school partnership? Email our team and let us know how we can help.</p>${button('Email Our Team', 'mailto:support@itsco.health?subject=Skill%20Builders%20program%20inquiry', 'teal')}<a class="contact-address" href="mailto:support@itsco.health?subject=Skill%20Builders%20program%20inquiry">support@itsco.health</a></article></section>
    <section class="wrap contact-next"><p class="eyebrow">BEFORE YOU REACH OUT</p><h2>We’ll help you find the right information.</h2><div><p><strong>For your child</strong><br>Ask about available programs, age groups, locations, schedules, and the enrollment process.</p><p><strong>For your school</strong><br>Share your school name and what you would like to learn about the program.</p><p><strong>For general questions</strong><br>Start with your contact information and a brief question. Please keep personal health details out of ordinary email.</p></div></section>${cta('Still exploring?<br>Start with the program.', 'View Program Overview', path('program'))}`;
}
const renders = { home, about, program, domains: domainPage, resources, contact };
for (const [key, page] of Object.entries(pages)) {
  const url = `${SKILL_BUILDERS_ORIGIN}${path(key)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}"><meta name="theme-color" content="#07384f">
<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SKILL_BUILDERS_ORIGIN}${assets}/brand-reference.png"><meta property="og:site_name" content="Skill Builders by ITSCO"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assets}/favicon.svg" type="image/svg+xml"><link rel="preload" href="${assets}/Montserrat-Variable.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="${assets}/site.css"><script src="${assets}/site.js" defer></script>
</head><body class="page-${key}">${header(key)}<main id="main" tabindex="-1">${renders[key]()}</main>${footer(key)}</body></html>`;
  const directory = `${out}${page.slug ? `/${page.slug}` : ''}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/index.html`, html);
}

// A real, accessible download generated from the same public program copy.
const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
const pdf = await PDFDocument.create();
pdf.setTitle('Skill Builders Program Guide');
pdf.setAuthor('ITSCO');
pdf.setSubject('Three domains, 17 topics, and skills for everyday life');
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const navy = rgb(0.027, 0.22, 0.31);
const normalize = s => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
function addGuidePage(eyebrow, title, paragraphs) {
  const p = pdf.addPage([612, 792]);
  p.drawRectangle({x:0,y:740,width:612,height:52,color:navy});
  p.drawText('SKILL BUILDERS  /  ITSCO', {x:44,y:759,font:bold,size:13,color:rgb(1,1,1)});
  let y = 704;
  const text = (value, size = 11, face = font, gap = 7) => {
    let line = '';
    for (const word of normalize(value).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > 524 && line) {
        p.drawText(line,{x:44,y,font:face,size,color:navy}); y -= size + gap; line = word;
      } else line = next;
    }
    if (line) {p.drawText(line,{x:44,y,font:face,size,color:navy}); y -= size + gap;}
  };
  text(eyebrow.toUpperCase(),10,bold,8); y-=8;
  text(title,27,bold,8); y-=15;
  for (const [heading,body] of paragraphs) {
    if (heading) text(heading,12,bold,6);
    text(body,11,font,6);y-=12;
  }
  p.drawText('itsco.health/skillbuilders  |  support@itsco.health', {x:44,y:34,size:9,font,color:navy});
  p.drawText(String(pdf.getPageCount()),{x:558,y:34,size:9,font,color:navy});
}
addGuidePage('Your program guide', 'Stronger Skills. Brighter Futures.', [
  ['', 'Skill Builders helps children and young learners develop essential interpersonal skills, personal growth, and emotional well-being.'],
  ...domains.map(d=>[d.name, d.summary]),
  ['How the program works', steps.map(([,title,body])=>`${title}: ${body}`).join(' ')],
  ['Find your next step', `Explore current programs at ${SKILL_BUILDERS_ENROLLMENT} or contact support@itsco.health with a brief program question.`]
]);
domains.forEach((d,i)=>addGuidePage(`Domain ${i+1} of 3`,d.name,[['',d.description],...d.topics,['Try it together',d.practice]]));
writeFileSync(fileURLToPath(new URL('../public/assets/skillbuilders/skill-builders-program-guide.pdf', import.meta.url)), await pdf.save());
console.log(`Built ${Object.keys(pages).length} Skill Builders pages and a ${pdf.getPageCount()}-page program guide.`);
