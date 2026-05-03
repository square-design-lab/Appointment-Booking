import React from 'react';

export default function ErrorScreen({ title, body, onRetry, retryLabel = 'Try again' }) {
  return (
    <div className="vbf-error-screen">
      <div className="vbf-error-screen__icon">⚠️</div>
      <div className="vbf-error-screen__title">{title}</div>
      {body && (
        <div
          className="vbf-error-screen__body"
          dangerouslySetInnerHTML={typeof body === 'string' ? { __html: body } : undefined}
        >
          {typeof body !== 'string' ? body : undefined}
        </div>
      )}
      {onRetry && (
        <button className="vbf-btn vbf-btn--primary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
