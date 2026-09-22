import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startVersionManager } from './utils/versionManager';
import './index.css';

// Initialize version checking, automatic update detection and old service worker cleanup
startVersionManager();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Ocorreu um erro inesperado no aplicativo">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
