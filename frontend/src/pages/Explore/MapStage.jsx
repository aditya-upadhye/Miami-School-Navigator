import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LeafletMap from '../../components/LeafletMap';
import { useI18n } from '../../i18n';

const glass = {
  background: 'var(--glass)',
  backdropFilter: 'blur(16px) saturate(170%)',
  WebkitBackdropFilter: 'blur(16px) saturate(170%)',
};

const mapButton = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: 0,
  ...glass,
  color: 'var(--ink)',
  boxShadow: '0 2px 8px rgba(16,35,46,0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default function MapStage({
  caption,
  closePop,
  countLabel,
  hasPop,
  hiddenLabel,
  home,
  noResults,
  onPick,
  pins,
  pinsKey,
  fitKey,
  pop,
  radiusMi,
  reset,
  zoneLevels,
  zones,
}) {
  const { t } = useI18n();
  const map = useRef(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  return (
    <section
      id="map"
      aria-label={t('explore.map.aria')}
      style={{ flex: '1 1 560px', minWidth: 0, height: 'var(--explore-h)', minHeight: 440, display: 'flex', flexDirection: 'column' }}
    >
      <div
        className="sn-map"
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid var(--edge)',
          boxShadow: 'var(--shadow)',
          isolation: 'isolate',
        }}
      >
        <LeafletMap
          ref={map}
          home={home}
          radiusMi={radiusMi}
          pins={pins}
          pinsKey={pinsKey}
          fitKey={fitKey}
          zones={zones}
          zoneLevels={zoneLevels}
          onPick={onPick}
          onTilesFailed={setTilesFailed}
        />

        <span
          style={{
            position: 'absolute',
            left: 14,
            top: 14,
            zIndex: 20,
            display: 'inline-flex',
            flexDirection: 'column',
            maxWidth: 'calc(100% - 90px)',
            padding: '8px 12px',
            borderRadius: 12,
            ...glass,
            boxShadow: '0 2px 8px rgba(16,35,46,0.15)',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700 }}>{countLabel}</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{hiddenLabel}</span>
        </span>

        <div
          style={{
            position: 'absolute',
            right: 14,
            top: 14,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button
            type="button"
            aria-label={t('explore.map.zoomIn')}
            onClick={() => map.current?.zoomIn()}
            style={mapButton}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t('explore.map.zoomOut')}
            onClick={() => map.current?.zoomOut()}
            style={mapButton}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t('explore.map.center')}
            onClick={() => map.current?.recenter()}
            style={mapButton}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
            </svg>
          </button>
        </div>

        {hasPop && (
          <div
            role="dialog"
            aria-label={pop.name}
            style={{
              position: 'absolute',
              left: 14,
              top: 74,
              zIndex: 30,
              width: 310,
              maxWidth: 'calc(100% - 28px)',
              maxHeight: 'calc(100% - 100px)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 16,
              borderRadius: 16,
              ...glass,
              boxShadow: '0 18px 40px rgba(16,35,46,0.25)',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--accent-ink)',
                  }}
                >
                  {pop.type} · {pop.grades}
                </span>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 19,
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {pop.name}
                </span>
              </div>
              <button
                type="button"
                aria-label={t('explore.map.close')}
                onClick={closePop}
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 0,
                  background: 'var(--glass3)',
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Stat label={t('explore.map.fromHome')} value={pop.distLabel} />
              <Stat label={t('explore.map.tuition')} value={pop.money} />
              <Stat label={t('explore.map.stateGrade')} value={pop.gradeLabel} />
              <Stat label={t('explore.map.enrollment')} value={pop.enrollment} />
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>{pop.fits}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Link
                to={`/school/${pop.id}`}
                style={{
                  flex: '1 1 auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 12,
                  background: 'var(--accent-grad)',
                  boxShadow: 'var(--accent-shadow)',
                  color: 'var(--on-accent)',
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: 'none',
                }}
              >
                {t('explore.map.moreDetails')}
              </Link>
              <button
                type="button"
                aria-pressed={pop.inCmp}
                onClick={pop.toggle}
                style={{
                  flex: '1 1 auto',
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: `1.5px solid ${pop.cmpBorder}`,
                  background: pop.cmpBg,
                  color: pop.cmpFg,
                  font: "700 15px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {pop.cmpLabel}
              </button>
            </div>
            {pop.website && (
              <a
                href={pop.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 14, fontWeight: 600 }}
              >
                {t('explore.map.website')}
              </a>
            )}
          </div>
        )}

        {noResults && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 30,
              width: 'min(360px, 80%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: 22,
              borderRadius: 16,
              ...glass,
              boxShadow: '0 12px 30px rgba(16,35,46,0.2)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
              {t('explore.map.noResults.title')}
            </span>
            <span style={{ fontSize: 15, color: 'var(--ink2)' }}>{t('explore.map.noResults.body')}</span>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 12,
                border: 0,
                background: 'var(--accent-grad)',
                boxShadow: 'var(--accent-shadow)',
                color: 'var(--on-accent)',
                font: "700 15px 'Figtree', sans-serif",
                cursor: 'pointer',
              }}
            >
              {t('explore.map.noResults.reset')}
            </button>
          </div>
        )}

        {tilesFailed && (
          <span
            role="status"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 44,
              transform: 'translateX(-50%)',
              width: 'max-content',
              maxWidth: 'calc(100% - 28px)',
              textAlign: 'center',
              zIndex: 25,
              padding: '6px 12px',
              borderRadius: 10,
              ...glass,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            {t('explore.map.tiles')}
          </span>
        )}

        <span
          style={{
            position: 'absolute',
            left: 120,
            bottom: 16,
            zIndex: 20,
            padding: '4px 10px',
            borderRadius: 8,
            background: 'var(--glass2)',
            fontSize: 12,
            color: 'var(--ink2)',
          }}
        >
          {caption}
        </span>
      </div>

    </section>
  );
}
