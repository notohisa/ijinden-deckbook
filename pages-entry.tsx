import { createRoot } from 'react-dom/client';
import AnalyticsConsent from './components/analytics-consent';
import Home from './app/page';
import './app/globals.css';

createRoot(document.getElementById('root')!).render(<><Home /><AnalyticsConsent /></>);
