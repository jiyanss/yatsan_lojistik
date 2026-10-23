import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yatsan İç Lojistik Planlama",
  description:
    "Yatsan iç lojistik planlama sistemi — araç talepleri, rota planlama, boş/yüklü km takibi, sevkiyat yönetimi ve raporlama. React + Firebase + Vercel.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230d2b4e'/%3E%3Ctext x='32' y='44' font-family='Arial' font-size='34' font-weight='bold' fill='white' text-anchor='middle'%3EY%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
