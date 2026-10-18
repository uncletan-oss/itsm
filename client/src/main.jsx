import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import { DEMO } from './api.js';
import './styles.css';

try {
  document.documentElement.dataset.theme = localStorage.getItem('itsm_theme') || 'light';
} catch {
  /* abaikan */
}

// Frontend portal (login) — disajikan di /portal/.
// GitHub Pages tidak mendukung SPA fallback, jadi mode demo memakai hash routing (#/m/incidents)
const Router = DEMO ? HashRouter : BrowserRouter;
const routerProps = DEMO ? {} : { basename: `${import.meta.env.BASE_URL}portal` };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
