import { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { validateCredentials } from '../../auth/authLogic';
import { ErrorAlert, Field, PasswordField, primaryButton } from '../../auth/ui';
import { useI18n } from '../../i18n';

/**
 * The sign-in / sign-up form, used on /login, /signup and on the landing page.
 * `onSuccess(user)` runs after the server accepted it; the caller decides where to go next.
 * `onSubmitStart()` lets the page know a submit began (so it does not redirect on its own while we are navigating).
 */
export default function AuthForm({ mode, onSuccess, onSubmitStart }) {
  const { t } = useI18n();
  const auth = useAuth();
  const signup = mode === 'signup';
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const errors = validateCredentials(values, { checkPasswordLength: signup });
  const shown = (f) => (touched[f] && errors[f] ? t(errors[f]) : undefined);
  const set = (f) => (e) => setValues((v) => ({ ...v, [f]: e.target.value }));
  const blur = (f) => () => setTouched((x) => ({ ...x, [f]: true }));

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setTouched({ email: true, password: true });
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();
    setSubmitting(true);
    setError(null);
    onSubmitStart?.();
    try {
      const user = await (signup ? auth.signup(values) : auth.login(values));
      onSuccess?.(user);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label={t(signup ? 'auth.signup.form' : 'auth.login.form')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {signup && (
          <Field
            label={t('auth.name')}
            type="text"
            name="name"
            autoComplete="name"
            maxLength={100}
            value={values.name}
            onChange={set('name')}
            placeholder={t('landing.signup.namePh')}
          />
        )}
        <Field
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          inputRef={emailRef}
          value={values.email}
          onChange={set('email')}
          onBlur={blur('email')}
          error={shown('email')}
          required
        />
        <PasswordField
          label={t('auth.password')}
          name="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          inputRef={passwordRef}
          value={values.password}
          onChange={set('password')}
          onBlur={blur('password')}
          error={shown('password')}
          hint={signup ? t('auth.passwordHint') : undefined}
          required
        />
        <ErrorAlert error={error} />
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...primaryButton,
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? 'progress' : 'pointer',
          }}
        >
          {t(
            submitting
              ? signup
                ? 'auth.signup.submitting'
                : 'auth.login.submitting'
              : signup
                ? 'auth.signup.submit'
                : 'auth.login.submit',
          )}
        </button>
      </div>
    </form>
  );
}
