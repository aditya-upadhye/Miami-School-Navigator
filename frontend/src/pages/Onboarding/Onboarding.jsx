import OnboardingHeader from './OnboardingHeader';
import ModePicker from './ModePicker';
import ChatPanel from './ChatPanel';
import FamilyForm from './FamilyForm';
import ThemeShell from '../../components/ThemeShell';
import { useOnboarding } from './useOnboarding';
import { useI18n } from '../../i18n';

export default function Onboarding() {
  const { t } = useI18n();
  const {
    addKid,
    budgetLabel,
    budgets,
    chatBg,
    chatBorder,
    chatOn,
    formBg,
    formBorder,
    formOn,
    kidCount,
    kids,
    kidsSummary,
    onRadius,
    onWhere,
    pickChat,
    pickForm,
    prioSummary,
    prios,
    radius,
    radiusLabel,
    removeKid,
    submit,
    submitting,
    error,
    where,
  } = useOnboarding();
  return (
    <ThemeShell>
      <OnboardingHeader />
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px clamp(16px, 4vw, 48px) 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Outfit', sans-serif",
              fontSize: 'clamp(32px, 3.6vw, 46px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {t('onboarding.title')}
          </h1>
          <p style={{ margin: 0, maxWidth: 720, fontSize: 18, lineHeight: 1.5, color: 'var(--ink2)' }}>
            {t('onboarding.lede')}
          </p>
        </div>
        <ModePicker
          chatBg={chatBg}
          chatBorder={chatBorder}
          chatOn={chatOn}
          formBg={formBg}
          formBorder={formBorder}
          formOn={formOn}
          pickChat={pickChat}
          pickForm={pickForm}
        />
        {chatOn && <ChatPanel />}
        {formOn && (
          <FamilyForm
            addKid={addKid}
            budgetLabel={budgetLabel}
            budgets={budgets}
            kidCount={kidCount}
            kids={kids}
            kidsSummary={kidsSummary}
            onRadius={onRadius}
            onWhere={onWhere}
            pickChat={pickChat}
            prioSummary={prioSummary}
            prios={prios}
            radius={radius}
            radiusLabel={radiusLabel}
            removeKid={removeKid}
            error={error}
            submit={submit}
            submitting={submitting}
            where={where}
          />
        )}
      </main>
    </ThemeShell>
  );
}
