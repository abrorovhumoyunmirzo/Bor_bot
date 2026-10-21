import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminPanel from './AdminPanel';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{(new URLSearchParams(window.location.search).has('admin') || new URLSearchParams(window.location.search).get('tgWebAppStartParam') === 'admin' || new URLSearchParams(window.location.search).get('startapp') === 'admin') ? <AdminPanel /> : <App />}</React.StrictMode>
);
