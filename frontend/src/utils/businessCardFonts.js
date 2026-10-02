import fontUrl from '../assets/fonts/business-cards/Comfortaa-Variable.ttf?url';
import fontLicense from '../assets/fonts/business-cards/Comfortaa-OFL.txt?raw';

let pending;
export function loadBusinessCardFonts() {
  if (!pending) pending = (async () => {
    const entries = await Promise.all([
      ['heading', 'CardHeading', fontUrl, '700'], ['body', 'CardBody', fontUrl, '400']
    ].map(async ([key, family, url, weight]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Card fonts could not load. Please reopen business cards and try again.');
      const bytes = await response.arrayBuffer();
      const face = await new FontFace(family, bytes, { weight }).load();
      document.fonts.add(face);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
        reader.readAsDataURL(new Blob([bytes], { type: 'font/ttf' }));
      });
      return [key, data];
    }));
    const context = document.createElement('canvas').getContext('2d');
    return { ...Object.fromEntries(entries), licenses: fontLicense, measure(value, size, family, weight) {
      context.font = `${weight} ${size}px ${family}`;
      return context.measureText(value).width;
    } };
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
