import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initTouchDnD } from './utils/touchDnD';
import { initMotionExit } from './utils/motionExit';
import { initMotionBusy } from './utils/motionBusy';
import './index.css';
import './styles/experience.css';
import './styles/motion.css';
import './styles/motion-premium.css';

initTouchDnD();
initMotionExit();
initMotionBusy();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
