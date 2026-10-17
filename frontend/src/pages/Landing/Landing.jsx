import ThemeShell from '../../components/ThemeShell';
import Cta from './Cta';
import Features from './Features';
import Hero from './Hero';
import LandingHeader from './LandingHeader';
import StartCard from './StartCard';

/** Welcome page, top to bottom: header, hero (headline and illustration) and the three ways to start, all on one pastel sweep so the
 *  choices are visible without scrolling; then what the app does, and a closing band. Every line of text sits on a plain or pastel surface with dark text. */
export default function Landing() {
  return (
    <ThemeShell variant="landing">
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ background: 'var(--hero-grad)', borderRadius: '0 0 50% 50% / 0 0 70px 70px' }}>
        <LandingHeader />
        <Hero />
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 clamp(16px, 4vw, 40px) 72px' }}>
          <StartCard />
        </div>
      </div>
      <main
        style={{
          flexGrow: 1,
          width: '100%',
          maxWidth: 1080,
          margin: '0 auto',
          padding: '64px clamp(16px, 4vw, 40px) 80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 80,
        }}
      >
        <Features />
      </main>
      <Cta />
      </div>
    </ThemeShell>
  );
}
