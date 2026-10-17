import AppHeader from '../../components/AppHeader';
import OnboardedNotice from '../../components/OnboardedNotice';
import ThemeShell from '../../components/ThemeShell';
import ActiveFilters from './ActiveFilters';
import ComparePanel from './ComparePanel';
import DatesList from './DatesList';
import ExploreIntro from './ExploreIntro';
import FiltersPanel from './FiltersPanel';
import MapStage from './MapStage';
import NaviChat from './NaviChat';
import ResultsList from './ResultsList';
import { useExplore } from './useExplore';

export default function Explore() {
  const x = useExplore();
  return (
    <ThemeShell paddingBottom={96}>
      <AppHeader active="explore" showSearch onSearch={x.searchLocation} onAskNavi={x.toggleChat} />
      <OnboardedNotice />
      {x.locationError && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '10px clamp(16px, 3vw, 40px)',
            background: 'rgba(220,38,38,0.14)',
            color: 'var(--ink)',
          }}
        >
          {x.locationError}
        </p>
      )}
      <ExploreIntro badge={x.badge} kids={x.kids} subtitle={x.subtitle} title={x.title} views={x.views} />
      <ActiveFilters filters={x.activeFilters} hiddenTotal={x.hiddenTotal} />
      <main
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: 24,
          padding: '0 clamp(16px, 3vw, 40px)',
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
          zoneNote={x.zoneNote}
          zoneToggles={x.zoneToggles}
          zones={x.zones}
        />
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
          toggleChat={x.toggleChat}
          types={x.types}
        />
      </main>
      <ComparePanel
        clearCmp={x.clearCmp}
        cmpCols={x.cmpCols}
        cmpCountLabel={x.cmpCountLabel}
        cmpFull={x.cmpFull}
        cmpHead={x.cmpHead}
        cmpMessage={x.cmpMessage}
        cmpMinW={x.cmpMinW}
        cmpRows={x.cmpRows}
        hasCmp={x.hasCmp}
        noCmp={x.noCmp}
      />
      <ResultsList
        empty={x.noResults}
        error={x.error}
        loading={x.loading}
        notes={x.notes}
        results={x.results}
        resultsTitle={x.resultsTitle}
        sortLabel={x.sortLabel}
      />
      <DatesList dates={x.dates} />
      <button
        type="button"
        aria-expanded={x.chatOpen}
        onClick={x.toggleChat}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 56,
          padding: '0 20px 0 10px',
          borderRadius: 999,
          border: 0,
          background: 'var(--panel-dark)',
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
          color: '#FFFFFF',
          font: "700 16px 'Figtree', sans-serif",
          boxShadow: '0 10px 30px rgba(16,35,46,0.35)',
          cursor: 'pointer',
        }}
      >
        <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="20" fill="#2A2650" />
          <path d="M20 9 L25 25 L20 21.5 L15 25 Z" fill="#F6C343" />
        </svg>
        {x.chatButtonLabel}
      </button>
      {x.chatOpen && <NaviChat toggleChat={x.toggleChat} />}
    </ThemeShell>
  );
}
