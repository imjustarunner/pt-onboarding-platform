// Official Avery diagrams: https://img.avery.com/web/templates/line-art/{template}
export const BUSINESS_CARD_LAYOUTS = Object.freeze({
  '35702': Object.freeze({ id:'35702', label:'Square', width:8.5, height:11, cardWidth:2.5, cardHeight:2.5, columns:3, rows:3, count:9, left:.25, top:.875, pitchX:2.75, pitchY:3.375, dimensions:'2.5 × 2.5 inches' }),
  '8870': Object.freeze({ id:'8870', label:'Rectangle', width:8.5, height:11, cardWidth:3.5, cardHeight:2, columns:2, rows:5, count:10, left:.75, top:.5, pitchX:3.5, pitchY:2, dimensions:'3.5 × 2 inches' })
});
export function businessCardLayout(format = '35702') {
  const layout = BUSINESS_CARD_LAYOUTS[String(format)];
  if (!layout) throw new Error('Choose Avery 35702 square cards or Avery 8870 rectangle cards.');
  return layout;
}
