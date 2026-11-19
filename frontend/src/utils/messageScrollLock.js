// A ticket dialog can open over the full screen inbox. Restore scrolling only
// after both surfaces release their locks, regardless of their unmount order.
let lockCount = 0;
let originalOverflow;
export function lockMessageScroll() {
  if (lockCount++ === 0) originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lockCount === 0) document.body.style.overflow = originalOverflow;
  };
}
