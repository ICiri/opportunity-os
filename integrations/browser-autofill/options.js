const fields = ['firstName', 'lastName', 'email', 'phone', 'city', 'country', 'linkedin', 'github', 'portfolio'];
const form = document.querySelector('#profile');
const saved = document.querySelector('#saved');

chrome.storage.local.get({profile: {}}, ({profile}) => {
  fields.forEach((field) => {
    form.elements[field].value = profile[field] ?? '';
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const profile = Object.fromEntries(fields.map((field) => [field, form.elements[field].value.trim()]));
  chrome.storage.local.set({profile}, () => {
    saved.textContent = 'Saved only in this browser.';
  });
});
