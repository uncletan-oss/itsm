// Frontend publik (tanpa login): beranda, status layanan, pusat bantuan, tata kelola & kepatuhan
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { DEMO } from '../api.js';
import { portalHref } from '../links.js';
import PublicApp from './PublicApp.jsx';
import '../styles.css';
import './public.css';

// Tautan lama (#/m/..., #/portal, dst.) dulu menuju portal — teruskan ke frontend portal
const legacy = window.location.hash.match(/^#(\/(m|portal|compliance|audit|users|settings)\b.*)$/);
if (legacy) window.location.replace(portalHref(legacy[1] === '/portal' ? '/portal' : legacy[1]));

const Router = DEMO ? HashRouter : BrowserRouter;
const routerProps = DEMO ? {} : { basename: import.meta.env.BASE_URL };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <PublicApp />
    </Router>
  </React.StrictMode>
);
