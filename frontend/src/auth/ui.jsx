import { useId, useState } from 'react';
import { useI18n } from '../i18n';

// Small form pieces shared by the sign-in, sign-up and account screens.

export const inputStyle = {
  width: '100%',
  height: 48,
  padding: '0 14px',
  border: '1.5px solid var(--line2)',
  borderRadius: 12,
  font: "16px 'Figtree', sans-serif",
  color: 'var(--ink)',
};

export const primaryButton = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 52,
  padding: '0 20px',
  border: 0,
  borderRadius: 14,
  background: 'var(--accent-grad)',
  boxShadow: 'var(--accent-shadow)',
  color: '#FFFFFF',
  font: "700 17px 'Figtree', sans-serif",
  textDecoration: 'none',
  cursor: 'pointer',
};

export const secondaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '0 18px',
  borderRadius: 12,
  border: '1.5px solid var(--line2)',
  background: 'var(--glass3)',
  color: 'var(--ink)',
  font: "700 15px 'Figtree', sans-serif",
  textDecoration: 'none',
  cursor: 'pointer',
};

export const dangerButton = {
  ...secondaryButton,
  border: '1.5px solid #B91C1C',
  background: '#B91C1C',
  color: '#FFFFFF',
};

export const labelStyle = { fontSize: 14, fontWeight: 600, lineHeight: '20px' };
export const errorTextStyle = { margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--danger)' };

/** A labelled input. `error` is already-translated text; the input is linked to it and to the optional hint. */
export function Field({ label, error, hint, inputRef, inputId, fieldStyle, ...input }) {
  const auto = useId();
  const id = inputId ?? auto;
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
        style={{ ...inputStyle, ...(error ? { border: '1.5px solid var(--danger)' } : null), ...fieldStyle }}
      />
      {hint && (
        <span id={`${id}-hint`} style={{ fontSize: 13, color: 'var(--ink3)' }}>
          {hint}
        </span>
      )}
      {error && (
        <p id={`${id}-err`} style={errorTextStyle}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Password input with a show/hide button. */
export function PasswordField({ label, ...rest }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const id = useId();
  const inputId = rest.inputId ?? id;
  return (
    <div style={{ position: 'relative' }}>
      <Field
        label={label}
        {...rest}
        inputId={inputId}
        type={shown ? 'text' : 'password'}
        fieldStyle={{ paddingRight: 52 }}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-controls={inputId}
        aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
        style={{
          position: 'absolute',
          right: 2,
          top: 28, // 20 px label + 6 px gap, plus 2 px so the 44 px target sits centred on the 48 px input
          width: 44,
          height: 44,
          border: 0,
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--ink2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}

/** Where the server's error goes: always in the DOM so screen readers announce it when it appears. */
export function ErrorAlert({ error, id }) {
  return (
    <div role="alert" id={id} style={{ margin: 0 }}>
      {error && (
        <p
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(220,38,38,0.14)',
            border: '1px solid rgba(220,38,38,0.5)',
            fontSize: 14.5,
            lineHeight: 1.45,
            color: 'var(--ink)',
          }}
        >
          {error.message} {error.suggestedAction}
        </p>
      )}
    </div>
  );
}
