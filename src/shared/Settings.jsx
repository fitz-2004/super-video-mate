import React, { useEffect, useState } from 'react';
import { EFFORTS, MODELS, loadSettings, saveSettings } from './settings.js';

export default function Settings({ notice }) {
  const [s, setS] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((v) => {
      setS(v);
      setKeyDraft(v.apiKey);
    });
  }, []);

  if (!s) return null;

  const update = async (patch) => setS(await saveSettings(patch));
  const saveKey = async () => {
    await update({ apiKey: keyDraft.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="settings">
      {notice && <div className="notice">{notice}</div>}

      <section className="card">
        <h2>Anthropic API key</h2>
        <p className="muted small">
          Stored only in this browser’s extension storage and sent only to api.anthropic.com. Get one at{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        </p>
        <div className="key-row">
          <input
            type={reveal ? 'text' : 'password'}
            value={keyDraft}
            placeholder="sk-ant-…"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
          />
          <button className="ghost-btn" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide' : 'Show'}</button>
          <button className="primary-btn" onClick={saveKey} disabled={keyDraft.trim() === s.apiKey}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Model</h2>
        <div className="options">
          {MODELS.map((m) => (
            <label key={m.id} className={`option ${s.model === m.id ? 'on' : ''}`}>
              <input type="radio" name="model" checked={s.model === m.id} onChange={() => update({ model: m.id })} />
              <span className="option-body">
                <span className="option-title">
                  {m.label}
                  <span className="price">${m.price.input} / ${m.price.output} per M tokens</span>
                </span>
                <span className="muted small">{m.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Answer style</h2>
        <div className="segmented" role="radiogroup">
          {EFFORTS.map((e) => (
            <button key={e.id} role="radio" aria-checked={s.effort === e.id} className={s.effort === e.id ? 'on' : ''} onClick={() => update({ effort: e.id })} title={e.blurb}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="muted small">{EFFORTS.find((e) => e.id === s.effort)?.blurb}.</p>
      </section>

      <section className="card">
        <h2>Behaviour</h2>
        <label className="toggle">
          <input type="checkbox" checked={s.autoPause} onChange={(e) => update({ autoPause: e.target.checked })} />
          <span>Pause the video while I type a question</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.showCost} onChange={(e) => update({ showCost: e.target.checked })} />
          <span>Show the cost of each answer</span>
        </label>
        <p className="muted small">Shortcuts on YouTube: <kbd>Alt</kbd>+<kbd>Q</kbd> ask · <kbd>Alt</kbd>+<kbd>S</kbd> attach frame · <kbd>Alt</kbd>+<kbd>M</kbd> show/hide.</p>
      </section>
    </div>
  );
}
