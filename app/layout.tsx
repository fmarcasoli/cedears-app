import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fundamentals de CEDEARs",
  description: "Estados contables de las empresas detrás de los CEDEARs, desde SEC EDGAR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
