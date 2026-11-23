import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const SITE_URL = "https://audiochi.vercel.app";
const TITLE = "Audiochi: real-time audio analysis in the browser";
const DESCRIPTION =
  "Live spectrogram, pitch tracking, 3D views and a sound classifier I trained myself, all running on-device in the browser.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Audiochi" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Audiochi",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/images/og_image.jpg", width: 1200, height: 630, alt: "Audiochi live spectrogram" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/images/og_image.jpg"],
  },
};

export const viewport = {
  themeColor: "#07060c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
