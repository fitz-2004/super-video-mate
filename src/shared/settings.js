// Settings live in chrome.storage.local so the sidebar and options page share them.

// Prices are USD per 1M tokens. Cache reads/writes are billed relative to input.
export const MODELS = [
  {
    id: 'claude-opus-5-5',
    label: 'Opus 5.5',
    blurb: 'Best judgement on “is this explained later?” — the default.',
    price: { input: 4, output: 20, cacheRead: 0.2 },
    fallbacks: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Sonnet 5.5',
    blurb: 'About half the cost of Opus, still sharp.',
    price: { input: 2, output: 10, cacheRead: 0.2 },
    fallbacks: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Haiku 5.5',
    blurb: 'Fastest and nearly free. Weaker on subtle cases.',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01 },
    fallbacks: false,
  },
];

export const EFFORTS = [
  { id: 'low', label: 'Quick', blurb: 'Fastest replies' },
  { id: 'medium', label: 'Thoughtful', blurb: 'A little slower, more careful' },
  { id: 'high', label: 'Deep', blurb: 'Slowest, for hard material' },
];

export const DEFAULTS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  autoPause: true,
  showCost: true,
};

const KEY = 'svm.settings';

export async function loadSettings() {
  const r = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(r[KEY] || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChange(cb) {
  const listener = (changes, area) => {
    if (area === 'local' && changes[KEY]) cb({ ...DEFAULTS, ...changes[KEY].newValue });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

export function costOf(usage, modelId) {
  if (!usage) return 0;
  const p = modelInfo(modelId).price;
  const M = 1e6;
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.cache_creation_input_tokens || 0) * p.input * 1.25 +
      (usage.cache_read_input_tokens || 0) * p.cacheRead +
      (usage.output_tokens || 0) * p.output) /
    M
  );
}
