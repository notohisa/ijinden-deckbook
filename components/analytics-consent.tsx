'use client';

import { useEffect, useState } from 'react';

const measurementId = 'G-PZYQCBGJCW';
const consentStorageKey = 'ijinden-analytics-consent';
const resetEventName = 'ijinden-analytics-consent-reset';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function enableAnalytics() {
  if (document.querySelector('script[data-ijinden-analytics]')) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  script.dataset.ijindenAnalytics = 'true';
  document.head.appendChild(script);
}

export function resetAnalyticsConsent() {
  window.localStorage.removeItem(consentStorageKey);
  window.dispatchEvent(new Event(resetEventName));
}

export default function AnalyticsConsent() {
  const [consent, setConsent] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const readConsent = () => setConsent(window.localStorage.getItem(consentStorageKey));
    readConsent();
    window.addEventListener(resetEventName, readConsent);
    return () => window.removeEventListener(resetEventName, readConsent);
  }, []);

  useEffect(() => {
    if (consent === 'granted') enableAnalytics();
  }, [consent]);

  const chooseConsent = (value: 'granted' | 'denied') => {
    window.localStorage.setItem(consentStorageKey, value);
    setConsent(value);
  };

  if (consent !== null) return null;

  return <aside className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl rounded-xl border border-[var(--line)] bg-white p-3 shadow-xl" aria-label="アクセス解析の選択">
    <p className="text-sm font-medium text-[var(--ink)]">アクセス解析について</p>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">利用状況を把握するためGoogle Analyticsを使用します。マイデッキの内容・デッキ名・カード選択は送信しません。</p>
    <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="h-8 rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-medium text-[var(--ink)]" onClick={() => chooseConsent('denied')}>許可しない</button><button type="button" className="h-8 rounded-lg bg-[var(--green)] px-3 text-xs font-medium text-white" onClick={() => chooseConsent('granted')}>許可する</button></div>
  </aside>;
}
