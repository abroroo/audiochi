import { Inter } from 'next/font/google'
import './globals.css'
import Head from "next/head";

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Audio Chi - AI Powered Audio Transcription',
  description: 'Audio Chi is an AI powered audio transcription service.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <Head>
        <title>Audio Chi - AI Powered Audio Transcription</title>
        <meta name="description" content="Audio Chi is an AI powered audio transcription service." />


        <meta property="og:url" content="https://audiochi.vercel.app" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Audio Chi - AI Powered Audio Transcription" />
        <meta property="og:description" content="Audio Chi is an AI powered audio transcription service." />
        <meta property="og:image" content="https://audiochi.vercel.app/images/og_image.png" />


        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="audiochi.vercel.app" />
        <meta property="twitter:url" content="https://audiochi.vercel.app/" />
        <meta name="twitter:title" content="Audio Chi - AI Powered Audio Transcription" />
        <meta name="twitter:description" content="Audio Chi is an AI powered audio transcription service." />
        <meta name="twitter:image" content="https://audiochi.vercel.app/images/og_image.png" />


      </Head>
      <body className={inter.className}>{children}</body>

    </html>
  )
}
