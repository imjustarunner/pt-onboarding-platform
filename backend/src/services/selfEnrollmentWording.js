/**
 * A student enrolling themselves should not read parent/dependent wording.
 * Replacements are ordered so longer phrases are resolved first.
 */
export function rewriteSelfEnrollmentWording(value) {
  return String(value || '')
    .replace(/your or your child's\/minor's/gi, 'your')
    .replace(/your \(or your child's\)/gi, 'your')
    .replace(/your child's\/minor's/gi, 'your')
    .replace(/your child's/gi, 'your')
    .replace(/your child\b/gi, 'you')
    .replace(/my dependent/gi, 'me');
}
