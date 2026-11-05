import './globals.css';
import { PwainstallPrompt } from './components/PwainstallPrompt';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FFB000" />
      </head>
      <body>
        <PwainstallPrompt />
        {children}
      </body>
    </html>
  );
}