export const JOIN_FONT_OPTIONS = [
  { id: 'great-vibes', label: 'Great Vibes', family: '"Great Vibes", cursive', kind: 'script' },
  { id: 'allura', label: 'Allura', family: '"Allura", cursive', kind: 'script' },
  { id: 'pacifico', label: 'Pacifico', family: '"Pacifico", cursive', kind: 'script' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", Georgia, serif', kind: 'serif' },
  { id: 'fraunces', label: 'Fraunces', family: '"Fraunces", Georgia, serif', kind: 'serif' },
  { id: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", serif', kind: 'serif' },
  { id: 'dm-serif', label: 'DM Serif Display', family: '"DM Serif Display", serif', kind: 'serif' },
  { id: 'lora', label: 'Lora', family: '"Lora", serif', kind: 'serif' },
  { id: 'source-sans', label: 'Source Sans 3', family: '"Source Sans 3", sans-serif', kind: 'sans' },
  { id: 'nunito', label: 'Nunito', family: '"Nunito", sans-serif', kind: 'sans' },
  { id: 'outfit', label: 'Outfit', family: '"Outfit", sans-serif', kind: 'sans' }
];

export const JOIN_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Allura&family=Cormorant+Garamond:wght@500;600;700&family=DM+Serif+Display&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Great+Vibes&family=Lora:wght@500;600;700&family=Nunito:wght@500;700&family=Outfit:wght@500;700&family=Pacifico&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap';

export function defaultJoinLayout() {
  return {
    footerStyle: 'hidden',
    showSidebar: false,
    fonts: {
      welcome: 'great-vibes',
      script: 'great-vibes',
      body: 'source-sans',
      cardTitle: 'playfair'
    },
    sizes: {
      welcome: 4.2,
      glad: 1.25,
      lead: 1,
      cardTitle: 1.45,
      cards: 1
    },
    positions: {
      welcome: { x: 0, y: 0 },
      glad: { x: 0, y: 0 },
      lead: { x: 0, y: 0 },
      cards: { x: 0, y: 0 }
    }
  };
}

export function fontFamilyById(id) {
  return JOIN_FONT_OPTIONS.find((f) => f.id === id)?.family || '"Source Sans 3", sans-serif';
}

export function mergeJoinLayout(saved) {
  const base = defaultJoinLayout();
  if (!saved || typeof saved !== 'object') return base;
  return {
    footerStyle: saved.footerStyle === 'frost' || !saved.footerStyle
      ? 'hidden'
      : ['hidden', 'white', 'clear', 'dark'].includes(saved.footerStyle)
        ? saved.footerStyle
        : base.footerStyle,
    showSidebar: saved.showSidebar === true,
    fonts: { ...base.fonts, ...(saved.fonts || {}) },
    sizes: { ...base.sizes, ...(saved.sizes || {}) },
    positions: {
      welcome: { ...base.positions.welcome, ...(saved.positions?.welcome || {}) },
      glad: { ...base.positions.glad, ...(saved.positions?.glad || {}) },
      lead: { ...base.positions.lead, ...(saved.positions?.lead || {}) },
      cards: { ...base.positions.cards, ...(saved.positions?.cards || {}) }
    }
  };
}
