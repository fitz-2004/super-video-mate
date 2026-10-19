import React from 'react';
import { createRoot } from 'react-dom/client';
import Settings from '../shared/Settings.jsx';
import '../shared/theme.css';
import './options.css';

function Options() {
  return (
    <div className="page">
      <header>
        <span className="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>
        </span>
        <div>
          <h1>Super Video Mate</h1>
          <p className="muted">A tutor that watches YouTube with you. Set it up once, then open any video.</p>
        </div>
      </header>
      <Settings />
      <section className="card">
        <h2>How to use it</h2>
        <ol className="steps">
          <li>Open any YouTube video — the Mate opens on the right.</li>
          <li>Ask the moment something is unclear. “What does this mean?” is enough.</li>
          <li>Click any <code>[mm:ss]</code> to jump; use <b>Remind me</b> for things explained later.</li>
        </ol>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Options />);
