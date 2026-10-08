/** Each announcement appears once per loop. A single announcement retains the
 * original multicolor presentation; multiple people keep their own stable color. */
export function announcementSequence(items) {
  if (!items?.length) return [];
  const sequence=items.length===1?Array.from({length:5},()=>items[0]):items;
  return sequence.map((item,index)=>({...item,tone:index%7}));
}
