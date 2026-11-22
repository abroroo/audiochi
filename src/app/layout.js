import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://audiochi.vercel.app";
const TITLE = "Audiochi: Real-time Sound Recognition in the Browser";
const DESCRIPTION =
  "Live spectrogram, 3D sound landscape and on-device sound classification, all running in your browser with Web Audio, WebGL and TensorFlow.js.";

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
  themeColor: "#220033",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
