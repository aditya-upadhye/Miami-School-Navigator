import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';

/** Goes to the previous page. When this tab has no earlier page (a bookmark, a shared link), goes to `fallback` instead. */
export default function BackButton({ fallback = '/' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback));
  return (
    <button
      type="button"
      onClick={goBack}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        padding: '0 16px 0 12px',
        borderRadius: 999,
        border: '1.5px solid var(--line2)',
        background: 'var(--surface)', // solid, so page content never shows through it when it floats over the page
        boxShadow: '0 4px 14px rgba(16, 35, 46, 0.18)',
        color: 'var(--ink)',
        font: "700 15px 'Figtree', sans-serif",
        cursor: 'pointer',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {t('menu.back')}
    </button>
  );
}
