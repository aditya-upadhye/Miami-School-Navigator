import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileProvider } from './profile/ProfileProvider';
import { SavedProvider } from './saved/SavedProvider';
import './styles/fonts.css';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ProfileProvider>
          <AuthProvider>
            <SavedProvider>
              <App />
            </SavedProvider>
          </AuthProvider>
        </ProfileProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
