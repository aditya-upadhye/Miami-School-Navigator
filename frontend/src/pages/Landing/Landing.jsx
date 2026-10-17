import Skyline from './Skyline';
import LandingHeader from './LandingHeader';
import Hero from './Hero';
import SignupCard from './SignupCard';
import ThemeShell from '../../components/ThemeShell';

export default function Landing() {
  return (
    <ThemeShell variant="landing">
      <Skyline />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <main
          style={{
            flexGrow: 1,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: 40,
            padding: '24px clamp(16px, 4vw, 56px) 72px',
          }}
        >
          <Hero />
          <SignupCard />
        </main>
      </div>
    </ThemeShell>
  );
}
