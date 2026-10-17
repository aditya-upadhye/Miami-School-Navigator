import { useState } from 'react';
import { Link } from 'react-router-dom';
import ResetProfileButton from '../../components/ResetProfileButton';
import { useI18n } from '../../i18n';
import ActiveFilters from './ActiveFilters';
import FiltersPanel from './FiltersPanel';
import ResultsList from './ResultsList';

const tabStyle = (on) => ({
  flex: 1,
  minHeight: 42,
  border: 0,
  borderRadius: 999,
  background: on ? 'var(--panel-dark)' : 'transparent',
  color: on ? '#FFFFFF' : 'var(--ink)',
  font: "700 14.5px 'Figtree', sans-serif",
  cursor: 'pointer',
});

const pill = (on) => ({
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 999,
  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
  background: on ? 'var(--accent-tint)' : 'transparent',
  color: on ? 'var(--accent-ink)' : 'var(--ink)',
  font: "600 13px 'Figtree', sans-serif",
  cursor: 'pointer',
});

/** Shown until the family enters where they live: nothing is searched or ranked without a real address. */
function AddressPrompt({ onSubmit }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(q.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 2px' }}>
      <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700 }}>{t('explore.needAddress.title')}</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink2)' }}>{t('explore.needAddress.body')}</p>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t('explore.needAddress.title')}
        placeholder={t('explore.needAddress.placeholder')}
        autoComplete="street-address"
        style={{ height: 48, padding: '0 14px', border: '1.5px solid var(--line2)', borderRadius: 12, font: "16px 'Figtree', sans-serif", color: 'var(--ink)' }}
      />
      <button
        type="submit"
        disabled={busy || !q.trim()}
        style={{ minHeight: 48, borderRadius: 12, border: 0, background: 'var(--accent-grad)', boxShadow: 'var(--accent-shadow)', color: 'var(--on-accent)', font: "700 16px 'Figtree', sans-serif", cursor: 'pointer', opacity: busy || !q.trim() ? 0.7 : 1 }}
      >
        {t('explore.needAddress.submit')}
      </button>
      <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>{t('explore.needAddress.or')}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        <Link viewTransition to="/onboarding?mode=chat" style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>{t('onboarding.mode.chat.title')}</Link>
        <Link viewTransition to="/onboarding?mode=form" style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>{t('onboarding.mode.form.title')}</Link>
      </div>
    </form>
  );
}

/** One side panel for what used to be two competing blocks: "Matches" (the ranked list) and "Filters", as tabs next to the map. */
export default function ExplorePanel({ x, onHide }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('matches');
  return (
    <aside
      aria-label={t('menu.tab.matches')}
      style={{
        flex: '0 1 400px',
        minWidth: 0,
        height: 'var(--explore-h)',
        minHeight: 440,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderRadius: 20,
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div role="tablist" style={{ flex: 1, display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--edge)' }}>
          <button role="tab" aria-selected={tab === 'matches'} type="button" onClick={() => setTab('matches')} style={tabStyle(tab === 'matches')}>
            {t('menu.tab.matches')}
          </button>
          <button role="tab" aria-selected={tab === 'filters'} type="button" onClick={() => setTab('filters')} style={tabStyle(tab === 'filters')}>
            {t('explore.filters.title')}
            {x.activeFilters.length > 0 ? ` · ${x.activeFilters.length}` : ''}
          </button>
        </div>
        <button
          type="button"
          aria-label={t('menu.panel.hide')}
          title={t('menu.panel.hide')}
          onClick={onHide}
          style={{ width: 40, height: 40, borderRadius: 20, border: 0, background: 'var(--glass3)', color: 'var(--ink)', fontSize: 18, cursor: 'pointer' }}
        >
          ›
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 2 }}>
        {tab === 'matches' && !x.hasLocation ? (
          <AddressPrompt onSubmit={x.searchLocation} />
        ) : tab === 'matches' ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {x.badge && (
                <span style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--glass3)', fontSize: 12.5, fontWeight: 600 }}>{x.badge}</span>
              )}
              <ResetProfileButton style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} aria-label={t('explore.view.aria')}>
              {x.views.map((v, i) => (
                <button key={i} type="button" aria-pressed={v.on} onClick={v.pick} style={pill(v.on)}>
                  {v.label}
                </button>
              ))}
            </div>
            {x.kids.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} aria-label={t('explore.for.aria')}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{t('explore.for')}</span>
                {x.kids.map((k, i) => (
                  <button key={i} type="button" aria-pressed={k.on} onClick={k.pick} style={pill(k.on)}>
                    {k.label}
                  </button>
                ))}
              </div>
            )}
            <ResultsList
              empty={x.noResults}
              error={x.error}
              loading={x.loading}
              notes={x.notes}
              results={x.results}
              resultsTitle={x.resultsTitle}
              sortLabel={x.sortLabel}
            />
          </>
        ) : (
          <>
            <ActiveFilters filters={x.activeFilters} hiddenTotal={x.hiddenTotal} />
          <FiltersPanel
            onRadius={x.onRadius}
            radius={x.radius}
            radiusLabel={x.radiusLabel}
            reset={x.reset}
            onlySpec={x.onlySpec}
            specNote={x.specNote}
            specs={x.specs}
            toggleOnlySpec={x.toggleOnlySpec}
            switches={x.switches}
            types={x.types}
            valueChips={x.valueChips}
            zoneNote={x.zoneNote}
            zoneToggles={x.zoneToggles}
          />
          </>
        )}
      </div>

    </aside>
  );
}
