import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing/Landing';
import Onboarding from './pages/Onboarding/Onboarding';
import Explore from './pages/Explore/Explore';
import School from './pages/School/School';
import Pathway from './pages/Pathway/Pathway';
import Planner from './pages/Planner/Planner';
import Saved from './pages/Saved/Saved';
import Account from './pages/Account/Account';
import Menu from './pages/Menu/Menu';

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
  '/saved': 'Saved schools · School Navigator',
  '/account': 'Sign in · School Navigator',
  '/menu': 'Menu · School Navigator',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? TITLES['/'];
  }, [pathname]);
  return null;
}

/** /login and /signup are the Account page's two tabs (links across the app use them); the query string, e.g. ?next=, is kept. */
function AuthRedirect({ signup = false }) {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  if (signup) p.set('tab', 'signup');
  const q = p.toString();
  return <Navigate to={`/account${q ? `?${q}` : ''}`} replace />;
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
        <Route path="/saved" element={<Saved />} />
        <Route path="/account" element={<Account />} />
        <Route path="/login" element={<AuthRedirect />} />
        <Route path="/signup" element={<AuthRedirect signup />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
