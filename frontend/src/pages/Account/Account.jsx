import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import ThemeShell from '../../components/ThemeShell';
import { useAuth } from '../../auth/AuthProvider';
import { MIN_PASSWORD } from '../../auth/authLogic';
import {
  dangerButton,
  ErrorAlert,
  Field,
  labelStyle,
  PasswordField,
  primaryButton,
  secondaryButton,
} from '../../auth/ui';
import { PRIORITY_LABEL_KEYS } from '../../data/family';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { childName, gradeLabelForAge } from '../../utils/stages';

const section = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 'clamp(16px, 4vw, 24px)',
  borderRadius: 20,
  border: '1px solid var(--edge)',
  background: 'var(--glass)',
  backdropFilter: 'blur(16px) saturate(170%)',
  WebkitBackdropFilter: 'blur(16px) saturate(170%)',
};
const h2 = { margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700 };
const p = { margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink2)' };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
      <dt style={{ ...labelStyle, minWidth: 130 }}>{label}</dt>
      <dd
        style={{ margin: 0, fontSize: 15, color: 'var(--ink2)', overflowWrap: 'anywhere', flex: '1 1 200px' }}
      >
        {children}
      </dd>
    </div>
  );
}

function NameForm({ user }) {
  const { t } = useI18n();
  const { updateName } = useAuth();
  const [name, setName] = useState(user.name ?? '');
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: null });
    try {
      await updateName(name);
      setState({ busy: false, done: true, error: null });
    } catch (error) {
      setState({ busy: false, done: false, error });
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field
        label={t('auth.name')}
        name="name"
        autoComplete="name"
        maxLength={100}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setState((s) => ({ ...s, done: false }));
        }}
      />
      <ErrorAlert error={state.error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={state.busy}
          style={{ ...secondaryButton, opacity: state.busy ? 0.7 : 1 }}
        >
          {t(state.busy ? 'account.name.saving' : 'account.name.save')}
        </button>
        <span role="status" style={{ fontSize: 14, color: 'var(--ink2)' }}>
          {state.done ? t('account.name.saved') : ''}
        </span>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const { changePassword } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const curRef = useRef(null);
  const nextRef = useRef(null);
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!cur) return curRef.current?.focus();
    if (next.length < MIN_PASSWORD) return nextRef.current?.focus();
    setState({ busy: true, done: false, error: null });
    try {
      await changePassword(cur, next);
      setCur('');
      setNext('');
      setTouched(false);
      setState({ busy: false, done: true, error: null });
    } catch (error) {
      setState({ busy: false, done: false, error });
    }
  };
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={t('account.password.title')}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <PasswordField
        label={t('account.password.current')}
        name="current-password"
        autoComplete="current-password"
        inputRef={curRef}
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        error={touched && !cur ? t('auth.err.passwordRequired') : undefined}
      />
      <PasswordField
        label={t('account.password.new')}
        name="new-password"
        autoComplete="new-password"
        inputRef={nextRef}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={t('auth.passwordHint')}
        error={
          (touched || tooShort) && next.length < MIN_PASSWORD
            ? t(next ? 'auth.err.passwordShort' : 'auth.err.passwordRequired')
            : undefined
        }
      />
      <ErrorAlert error={state.error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={state.busy}
          style={{ ...secondaryButton, opacity: state.busy ? 0.7 : 1 }}
        >
          {t(state.busy ? 'account.password.saving' : 'account.password.submit')}
        </button>
        <span role="status" style={{ fontSize: 14, color: 'var(--ink2)' }}>
          {state.done ? t('account.password.done') : ''}
        </span>
      </div>
    </form>
  );
}

function DeleteSection() {
  const { t } = useI18n();
  const { deleteAccount } = useAuth();
  const [step, setStep] = useState('idle'); // idle | confirm
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  const startRef = useRef(null);
  const cancel = () => {
    setStep('idle');
    setPassword('');
    setState({ busy: false, error: null });
    setTimeout(() => startRef.current?.focus(), 0);
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (!password) return setState({ busy: false, error: { message: t('auth.err.passwordRequired') } });
    setState({ busy: true, error: null });
    try {
      await deleteAccount(password); // the page then sees a signed-out visitor and goes home
    } catch (error) {
      setState({ busy: false, error });
    }
  };
  return (
    <section aria-labelledby="acct-delete" style={section}>
      <h2 id="acct-delete" style={h2}>
        {t('account.delete.title')}
      </h2>
      <p style={p}>{t('account.delete.body')}</p>
      {step === 'idle' ? (
        <div>
          <button
            ref={startRef}
            type="button"
            onClick={() => setStep('confirm')}
            style={{ ...secondaryButton, border: '1.5px solid var(--danger)' }}
          >
            {t('account.delete.start')}
          </button>
        </div>
      ) : (
        <form
          onSubmit={confirm}
          noValidate
          aria-label={t('account.delete.confirmTitle')}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p role="alert" style={{ ...p, fontWeight: 700, color: 'var(--ink)' }}>
            {t('account.delete.warning')}
          </p>
          <PasswordField
            label={t('account.delete.password')}
            name="delete-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorAlert error={state.error} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={state.busy}
              style={{ ...dangerButton, opacity: state.busy ? 0.7 : 1 }}
            >
              {t(state.busy ? 'account.delete.deleting' : 'account.delete.confirm')}
            </button>
            <button type="button" onClick={cancel} disabled={state.busy} style={secondaryButton}>
              {t('account.delete.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Account() {
  const { t, tp, lang, date } = useI18n();
  const { user, ready, logout, showNotice, profileStatus } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const wasSignedIn = useRef(false);
  if (user) wasSignedIn.current = true;

  if (!ready) {
    return (
      <ThemeShell>
        <AppHeader />
        <p role="status" style={{ padding: 32, color: 'var(--ink2)' }}>
          {t('account.loading')}
        </p>
      </ThemeShell>
    );
  }
  if (!user) {
    // Never signed in here: ask them to. Signed out (or deleted) while on this page: go home.
    return <Navigate to={wasSignedIn.current ? '/' : '/login?next=%2Faccount'} replace />;
  }

  const signOut = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      showNotice(err);
    }
  };

  const kids = profile.children ?? [];
  const prios = (profile.priorities ?? []).map((x) =>
    PRIORITY_LABEL_KEYS[x] ? t(PRIORITY_LABEL_KEYS[x]) : x,
  );
  return (
    <ThemeShell paddingBottom={96}>
      <AppHeader />
      <main
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '32px clamp(16px, 4vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(32px, 3.8vw, 46px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          {t('account.title')}
        </h1>

        <section aria-labelledby="acct-you" style={section}>
          <h2 id="acct-you" style={h2}>
            {t('account.you.title')}
          </h2>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label={t('auth.email')}>{user.email}</Row>
            <Row label={t('account.since')}>{user.created_at ? date(user.created_at.slice(0, 10)) : ''}</Row>
          </dl>
          <NameForm key={user.id} user={user} />
        </section>

        <section aria-labelledby="acct-profile" style={section}>
          <h2 id="acct-profile" style={h2}>
            {t('account.profile.title')}
          </h2>
          {profile.isDemo ? (
            <p style={p}>{t('account.profile.none')}</p>
          ) : (
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row label={t('account.profile.address')}>{profile.matchedAddress || profile.address}</Row>
              <Row label={t('account.profile.children')}>
                {kids.length
                  ? kids
                      .map((c, i) => `${childName(c, i, lang)} (${gradeLabelForAge(c.age, lang)})`)
                      .join(', ')
                  : t('account.profile.noChildren')}
              </Row>
              <Row label={t('account.profile.radius')}>{tp('onboarding.radius', profile.radius ?? 3)}</Row>
              <Row label={t('account.profile.budget')}>
                {t(profile.freeOnly ? 'onboarding.budget.free' : 'onboarding.budget.any')}
              </Row>
              <Row label={t('account.profile.priorities')}>
                {prios.length ? prios.join(', ') : t('onboarding.summary.none')}
              </Row>
            </dl>
          )}
          <p style={{ ...p, color: 'var(--ink)' }}>
            {t('account.profile.stored')} {t('account.profile.storedKids')}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/onboarding" style={secondaryButton}>
              {t(profile.isDemo ? 'account.profile.add' : 'account.profile.edit')}
            </Link>
            <span role="status" style={{ fontSize: 14, color: 'var(--ink2)' }}>
              {profileStatus === 'saving'
                ? t('account.profile.saving')
                : profileStatus === 'saved'
                  ? t('account.profile.saved')
                  : profileStatus === 'error'
                    ? t('account.profile.error')
                    : ''}
            </span>
          </div>
        </section>

        <section aria-labelledby="acct-pass" style={section}>
          <h2 id="acct-pass" style={h2}>
            {t('account.password.title')}
          </h2>
          <PasswordForm />
        </section>

        <section aria-labelledby="acct-out" style={section}>
          <h2 id="acct-out" style={h2}>
            {t('auth.signOut')}
          </h2>
          <p style={p}>{t('account.signout.body')}</p>
          <div>
            <button type="button" onClick={signOut} style={primaryButton}>
              {t('auth.signOut')}
            </button>
          </div>
        </section>

        <DeleteSection />
      </main>
    </ThemeShell>
  );
}
