import type { Metadata } from 'next';
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
  return <html lang="ja"><body>{children}<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={'{"token":"d72e2fc6487c4978831a721f916e786f"}'} /></body></html>;
}
