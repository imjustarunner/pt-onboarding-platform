import { onBeforeUnmount, onMounted } from 'vue';

export function useNoteworthyMetadata({ title, description, path = '/noteworthy' }) {
  const previous = new Map();
  let oldTitle;
  function set(selector, tag, attributes) {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement(tag);
      previous.set(element, null);
      document.head.appendChild(element);
    } else if (!previous.has(element)) {
      previous.set(element, [...element.attributes].map(attribute => [attribute.name, attribute.value]));
    }
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  }
  onMounted(() => {
    oldTitle = document.title;
    document.title = title;
    set('meta[name="description"]', 'meta', { name: 'description', content: description });
    set('meta[property="og:title"]', 'meta', { property: 'og:title', content: title });
    set('meta[property="og:description"]', 'meta', { property: 'og:description', content: description });
    set('meta[property="og:type"]', 'meta', { property: 'og:type', content: 'website' });
    set('meta[property="og:url"]', 'meta', { property: 'og:url', content: `https://fundthred.com${path}` });
    set('link[rel="canonical"]', 'link', { rel: 'canonical', href: `https://fundthred.com${path}` });
  });
  onBeforeUnmount(() => {
    if (oldTitle !== undefined) document.title = oldTitle;
    for (const [element, attributes] of previous) {
      if (attributes === null) element.remove();
      else {
        for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
        for (const [name, value] of attributes) element.setAttribute(name, value);
      }
    }
  });
}
