import type { Metadata } from 'next';
import AnalyticsConsent from '@/components/analytics-consent';
import './globals.css';

export const metadata: Metadata = {
  title: 'イジンデン デッキ帳',
  description: 'イジンデンのデッキをこの端末に保存して作成できる、非公式のデッキ作成補助アプリ。',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'イジンデン デッキ帳',
    description: 'イジンデンのデッキをこの端末に保存して作成できる、非公式のデッキ作成補助アプリ。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}<AnalyticsConsent /></body></html>;
}
