import { Inter } from 'next/font/google'
import Head from "next/head";
import './globals.css'


const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Audio Chi - AI Powered Audio Transcription',
  description: 'Audio Chi is an AI powered audio transcription service.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <Head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />


      </Head>
      <body className={inter.className}>{children}



      </body>

    </html>
  )
}
