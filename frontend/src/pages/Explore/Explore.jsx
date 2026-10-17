import { useEffect, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import BackButton from '../../components/BackButton';
import ThemeShell from '../../components/ThemeShell';
import { useI18n } from '../../i18n';
import ComparePanel from './ComparePanel';
import { CompareTray } from './CompareTray';
import CompareLimitToast from './CompareLimitToast';
import DatesList from './DatesList';
import ExplorePanel from './ExplorePanel';
import MapStage from './MapStage';
import JarvisChat from './JarvisChat';
import { useExplore } from './useExplore';

/** Map first: a fixed slim header, the map filling the screen, and one side panel (matches + filters) that can be hidden.
 *  Compare, then key dates (last), sit below the map. Talk to Jarvis is in the header's top-right corner; Back floats at the bottom-left. */
export default function Explore() {
  const x = useExplore();
  const { t } = useI18n();
  const [panelOpen, setPanelOpen] = useState(true);
  // The compare bar is only needed while the table is out of sight; once the table is on screen it would just cover rows.
  const [tableInView, setTableInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById('compare');
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setTableInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cmpProps = {
    clearCmp: x.clearCmp,
    cmpChart: x.cmpChart,
    cmpCols: x.cmpCols,
    cmpCountLabel: x.cmpCountLabel,
    cmpFull: x.cmpFull,
    cmpHead: x.cmpHead,
    cmpMessage: x.cmpMessage,
    cmpMinW: x.cmpMinW,
    cmpRows: x.cmpRows,
    hasCmp: x.hasCmp,
    noCmp: x.noCmp,
  };
  return (
    <ThemeShell paddingBottom={96}>
      <AppHeader active="explore" showSearch compact onSearch={x.searchLocation} onAskJarvis={x.toggleChat} />
      {x.chatNote && (
        <p role="status" style={{ margin: 0, padding: '10px clamp(16px, 3vw, 40px)', background: 'var(--accent-tint)', color: 'var(--ink)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>{x.chatNote}</span>
          <button type="button" onClick={x.dismissChatNote} aria-label={t('explore.found.dismiss')} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, border: 0, background: 'var(--glass3)', color: 'var(--ink)', cursor: 'pointer' }}>
            ×
          </button>
        </p>
      )}
      {x.pinnedNotice && (
        <p role="status" style={{ margin: 0, padding: '10px clamp(16px, 3vw, 40px)', background: 'var(--accent-tint)', color: 'var(--ink)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
          <span>{x.pinnedNotice.text}</span>
          <button type="button" onClick={x.clearPinned} style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, border: '1.5px solid var(--line2)', background: 'var(--glass)', color: 'var(--ink)', font: "600 14px 'Figtree', sans-serif", cursor: 'pointer' }}>
            {x.pinnedNotice.back}
          </button>
        </p>
      )}
      {x.searchNotice && (
        <p role="status" style={{ margin: 0, padding: '10px clamp(16px, 3vw, 40px)', background: 'var(--accent-tint)', color: 'var(--ink)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
          <span>
            {t(x.searchNotice.atSchool ? 'explore.found.atSchool' : 'explore.found.shown', { name: x.searchNotice.name })}
          </span>
          {x.searchNotice.total > 1 && <span>{t('explore.found.others')}</span>}
          {x.searchNotice.others.map((o) => (
            <button key={o.id} type="button" onClick={() => x.pickFound(o)} style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, border: '1.5px solid var(--line2)', background: 'var(--glass)', color: 'var(--ink)', font: "600 14px 'Figtree', sans-serif", cursor: 'pointer' }}>
              {o.name}
            </button>
          ))}
          <button type="button" onClick={x.dismissNotice} aria-label={t('explore.found.dismiss')} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, border: 0, background: 'var(--glass3)', color: 'var(--ink)', cursor: 'pointer' }}>
            ×
          </button>
        </p>
      )}
      {x.locationError && (
        <p role="alert" style={{ margin: 0, padding: '10px clamp(16px, 3vw, 40px)', background: 'rgba(220,38,38,0.14)', color: 'var(--ink)' }}>
          {x.locationError}
        </p>
      )}
      {/* Wide screens: map and panel fill the screen under the header. Narrow screens: a shorter map, with the panel stacked below it. */}
      <style>{'@media (max-width: 1000px) { .explore-main { --explore-h: 64vh !important; } }'}</style>
      <main
        className="explore-main"
        style={{
          '--explore-h': 'calc(100vh - 100px)',
          position: 'relative',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: 14,
          padding: '12px clamp(10px, 1.6vw, 24px) 0',
        }}
      >
        <MapStage
          caption={x.caption}
          closePop={x.closePop}
          countLabel={x.countLabel}
          hasPop={x.hasPop}
          hiddenLabel={x.hiddenLabel}
          home={x.home}
          noResults={x.noResults}
          onPick={x.onPick}
          pins={x.pins}
          pinsKey={x.pinsKey}
          fitKey={x.fitKey}
          pop={x.pop}
          radiusMi={x.radiusMi}
          reset={x.reset}
          zoneLevels={x.zoneLevels}
          zones={x.zones}
        />
        {panelOpen ? (
          <ExplorePanel x={x} onHide={() => setPanelOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            style={{
              position: 'absolute',
              right: 'calc(clamp(10px, 1.6vw, 24px) + 62px)',
              top: 26,
              zIndex: 40,
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 999,
              border: 0,
              background: 'var(--panel-dark)',
              color: '#FFFFFF',
              font: "700 14.5px 'Figtree', sans-serif",
              boxShadow: '0 6px 20px rgba(16,35,46,0.3)',
              cursor: 'pointer',
            }}
          >
            ‹ {t('menu.panel.show')}
          </button>
        )}
      </main>
      <div style={{ paddingTop: 24 }}>
        <ComparePanel {...cmpProps} />
        <DatesList dates={x.dates} />
      </div>
      <CompareLimitToast
        at={x.cmpFull ? x.cmpFullAt : 0}
        onDismiss={x.dismissCmpFull}
        onGo={() => {
          x.dismissCmpFull();
          document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
      <div className="explore-back" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 60 }}>
        <BackButton fallback="/" />
      </div>
      {!x.noCmp && !tableInView && (
        <CompareTray
          head={x.cmpHead}
          countLabel={x.cmpCountLabel}
          onOpen={() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}
      {x.chatOpen && <JarvisChat toggleChat={x.toggleChat} />}
    </ThemeShell>
  );
}
