import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing/Landing';
import Onboarding from './pages/Onboarding/Onboarding';
import Explore from './pages/Explore/Explore';
import School from './pages/School/School';
import Pathway from './pages/Pathway/Pathway';
import Planner from './pages/Planner/Planner';
import Account from './pages/Account/Account';
import AuthPage from './pages/Auth/AuthPage';
import Saved from './pages/Saved/Saved';

/** Scroll to the top on navigation, or to the #anchor when the link has one. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const TITLES = {
  '/': 'Miami-Dade School Navigator',
  '/onboarding': 'Your family · School Navigator',
  '/explore': 'Explore schools · School Navigator',
  '/school': 'School details · School Navigator',
  '/pathway': 'Pathway · School Navigator',
  '/planner': 'School choice plan · School Navigator',
  '/login': 'Sign in · School Navigator',
  '/signup': 'Create your account · School Navigator',
  '/account': 'Your account · School Navigator',
  '/saved': 'Saved schools · School Navigator',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? TITLES['/'];
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/school/:id" element={<School />} />
        <Route path="/school" element={<Navigate to="/explore" replace />} />
        <Route path="/pathway" element={<Pathway />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/account" element={<Account />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
