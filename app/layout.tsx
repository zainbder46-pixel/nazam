import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام — رتّب حياتك وعملك",
  description: "نظام شخصي ومشترك للمهام والصفحات والعبادات والمالية",
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
  appleWebApp: { capable: true, title: "نظام", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
