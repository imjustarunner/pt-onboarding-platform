// A local, fictional demonstration. No requests, storage, appointments or PHI.
const providers = {
  avery: { name: 'Avery Lane', format: 'Virtual', slots: ['Tuesday, 10:00 AM', 'Wednesday, 2:00 PM', 'Friday, 11:00 AM'] },
  jordan: { name: 'Jordan Reed', format: 'In person', slots: ['Monday, 9:00 AM', 'Thursday, 1:00 PM', 'Friday, 3:00 PM'] }
};
for (const demo of document.querySelectorAll('[data-provider-demo]')) {
  let selected = providers.avery;
  const result = demo.querySelector('[data-selection]');
  const slots = [...demo.querySelectorAll('[data-slot]')];
  demo.addEventListener('change', event => {
    if (!event.target.matches('input[name="example-provider"]')) return;
    selected = providers[event.target.value];
    if (!selected) return;
    demo.querySelector('[data-provider-name]').textContent = `${selected.name} · ${selected.format} · Mountain Time`;
    slots.forEach((button, index) => {
      const [day, time] = selected.slots[index].split(', ');
      button.dataset.slot = selected.slots[index];
      button.replaceChildren(document.createTextNode(`${day.slice(0, 3)} `));
      const strong = document.createElement('strong');
      strong.textContent = time;
      button.append(strong);
      button.setAttribute('aria-pressed', 'false');
    });
    result.textContent = `${selected.name} selected. Choose an example time.`;
  });
  demo.addEventListener('click', event => {
    const button = event.target.closest('[data-slot]');
    if (!button || !demo.contains(button)) return;
    slots.forEach(slot => slot.setAttribute('aria-pressed', String(slot === button)));
    result.textContent = `Example selection: ${selected.name}, ${button.dataset.slot} (Mountain Time). A configured workflow would continue to enrollment or an appointment request. Nothing has been booked.`;
  });
}
