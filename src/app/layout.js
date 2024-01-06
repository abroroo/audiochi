import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Audio Chi - AI Powered Audio Transcription',
  description: 'Audio Chi is an AI powered audio transcription service.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>

    </html>
  )
}
