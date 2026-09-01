document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#fill').addEventListener('click', async () => {
  const result = document.querySelector('#result');
  const {profile = {}} = await chrome.storage.local.get('profile');
  if (!profile.email) {
    result.textContent = 'Add and save your local profile first.';
    return;
  }
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) {
    result.textContent = 'Open an HTTPS application form first.';
    return;
  }
  const [{result: summary}] = await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: fillReviewedFields,
    args: [profile],
  });
  result.textContent = `${summary.filled} fields filled; ${summary.review} fields need review. Submit was not touched.`;
});

function fillReviewedFields(profile) {
  const rules = [
    [/first.?name|given.?name/i, profile.firstName],
    [/last.?name|family.?name|surname/i, profile.lastName],
    [/(^|\b)e-?mail(\b|$)/i, profile.email],
    [/(^|\b)(phone|mobile|telephone)(\b|$)/i, profile.phone],
    [/(^|\b)city(\b|$)/i, profile.city],
    [/(^|\b)country(\b|$)/i, profile.country],
    [/linkedin/i, profile.linkedin],
    [/github/i, profile.github],
    [/(portfolio|personal website)/i, profile.portfolio],
  ];
  const blocked =
    /(password|salary|compensation|gender|race|ethnic|disab|veteran|ssn|social security|passport|visa|sponsor|authorization|cover letter|why |describe|message)/i;
  let filled = 0;
  for (const input of document.querySelectorAll('input:not([type=file]):not([type=hidden]), textarea')) {
    const label = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute('aria-label'),
      input.autocomplete,
      input.labels?.[0]?.textContent,
    ]
      .filter(Boolean)
      .join(' ');
    if (blocked.test(label) || input.disabled || input.readOnly || input.value) continue;
    const match = rules.find(([pattern, value]) => value && pattern.test(label));
    if (!match) continue;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, match[1]);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.style.outline = '3px solid #2d8f6f';
    filled += 1;
  }
  const review = document.querySelectorAll(
    'select, input[type=file], input[type=radio], input[type=checkbox], textarea',
  ).length;
  return {filled, review};
}
