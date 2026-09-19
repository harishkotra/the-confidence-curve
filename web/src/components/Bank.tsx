/** The question bank, visible in the app so grading can be audited. */

import { useState } from 'react';
import type { Question } from '../lib/types';

export function Bank({ questions }: { questions: Question[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Question bank</h2>
        <span style={{ fontSize: '0.625rem', color: 'var(--dim)' }}>
          {questions.length} items · 5 per level
        </span>
      </div>
      <div className="bank">
        {questions.map((q) => (
          <div key={q.id}>
            <button
              type="button"
              className="bank__row"
              style={{
                width: '100%',
                background: openId === q.id ? 'var(--panel-2)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(35,43,54,.5)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onClick={() => setOpenId(openId === q.id ? null : q.id)}
              aria-expanded={openId === q.id}
            >
              <span className="bank__d">D{q.difficulty}</span>
              <span className="bank__q" title={q.question.split('\n')[0]}>
                {q.question.split('\n')[0]}
              </span>
              <span className="bank__a">{q.answer}</span>
            </button>
            {openId === q.id ? (
              <div
                style={{
                  padding: '0.6rem 0.7rem',
                  background: 'var(--bench)',
                  borderBottom: '1px solid var(--rule)',
                  fontSize: '0.6875rem',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: 'var(--dim)', marginBottom: '0.4rem' }}>
                  <span className="bank__cat">{q.category}</span> · {q.id}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{q.question}</div>
                <div style={{ color: 'var(--brass)' }}>stored answer: {q.answer}</div>
                {q.aliases?.length ? (
                  <div style={{ color: 'var(--dim)' }}>also accepted: {q.aliases.join(', ')}</div>
                ) : null}
                <div style={{ color: 'var(--dim)', marginTop: '0.3rem' }}>{q.note}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: '0.6rem' }}>
        Grading is a normalised string comparison in code. No model grades another model.
      </p>
    </section>
  );
}