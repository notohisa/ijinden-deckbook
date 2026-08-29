import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'デッキ帳 | Google Drive デッキ管理',
  description: 'あなたのデッキを、あなた自身のGoogle Driveに保存するデッキ作成アプリ。',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'デッキ帳',
    description: 'Google Drive に、あなたのデッキを。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
