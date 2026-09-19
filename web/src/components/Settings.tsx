/** Settings. Base URL, key, both models, temperature, max tokens, reasoning toggle. */

import { useState } from 'react';
import { DEFAULT_CONFIG } from '../lib/config';
import type { RunConfig } from '../lib/types';

interface Props {
  config: RunConfig;
  onChange: (next: RunConfig) => void;
  onClose: () => void;
}

export function Settings({ config, onChange, onClose }: Props) {
  const [revealKey, setRevealKey] = useState(false);

  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Settings</h2>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="baseUrl">
          Base URL
        </label>
        <input
          id="baseUrl"
          className="field__input"
          type="url"
          spellCheck={false}
          value={config.baseUrl}
          onChange={(e) => set('baseUrl', e.target.value)}
          placeholder="https://api.particle.ai/v1"
        />
        <span className="field__hint">The /chat/completions path is appended to this.</span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="apiKey">
          API key
        </label>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            id="apiKey"
            className="field__input"
            type={revealKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={config.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
            placeholder="paste your key"
          />
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setRevealKey((v) => !v)}
            aria-label={revealKey ? 'Hide API key' : 'Show API key'}
          >
            {revealKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <span className="field__hint">
          Stored in this browser's localStorage only. Sent per request, never written to the server's
          disk or the run log.
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="modelA">
          Model A — the older model
        </label>
        <input
          id="modelA"
          className="field__input"
          spellCheck={false}
          value={config.modelA}
          onChange={(e) => set('modelA', e.target.value)}
          placeholder="deepseek-v4-flash-0731"
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="modelB">
          Model B — the newer model
        </label>
        <input
          id="modelB"
          className="field__input"
          spellCheck={false}
          value={config.modelB}
          onChange={(e) => set('modelB', e.target.value)}
          placeholder="deepseek-v4.1-flash"
        />
      </div>

      <div className="field__row">
        <div className="field">
          <label className="field__label" htmlFor="temperature">
            Temperature
          </label>
          <input
            id="temperature"
            className="field__input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={(e) => set('temperature', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="maxTokens">
            Max tokens
          </label>
          <input
            id="maxTokens"
            className="field__input"
            type="number"
            min={1}
            step={100}
            value={config.maxTokens}
            onChange={(e) => set('maxTokens', Number(e.target.value))}
          />
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={config.disableReasoning}
          onChange={(e) => set('disableReasoning', e.target.checked)}
        />
        <span className="check__text">
          Disable reasoning
          <span className="check__hint">
            Sends <code>chat_template_kwargs: {'{"enable_thinking": false}'}</code>. Run the sweep
            twice to see the reasoning tax as a switch.
          </span>
        </span>
      </label>

      <div className="settings__actions">
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onChange({ ...DEFAULT_CONFIG, apiKey: config.apiKey })}
        >
          Restore defaults
        </button>
      </div>
    </section>
  );
}