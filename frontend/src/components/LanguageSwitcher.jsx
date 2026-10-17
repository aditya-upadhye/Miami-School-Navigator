import { LANGS, LANG_NAMES, useI18n } from '../i18n';

/** EN / ES / HT toggle. Sets the language for Navi's replies and, on translated screens, the page text. */
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--edge)' }}
    >
      {LANGS.map((code) => {
        const on = lang === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={on}
            aria-label={LANG_NAMES[code]}
            title={LANG_NAMES[code]}
            onClick={() => setLang(code)}
            style={{
              minWidth: 40,
              minHeight: 38,
              padding: '0 10px',
              border: 0,
              borderRadius: 999,
              background: on ? 'var(--panel-dark)' : 'transparent',
              color: on ? '#FFFFFF' : 'var(--ink)',
              font: "700 13px 'Figtree', sans-serif",
              cursor: 'pointer',
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
