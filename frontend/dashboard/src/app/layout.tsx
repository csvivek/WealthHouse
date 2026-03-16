import type { Metadata } from 'next'
import { DM_Mono, DM_Sans, Inter } from 'next/font/google'
import { Providers } from '@/lib/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  display: 'swap',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  applicationName: 'Wealth House',
  title: 'Wealth House — Personal Finance & Wealth Management',
  description:
    'A comprehensive platform for tracking net worth, investments, real estate, crypto, and financial goals.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${dmSans.variable} ${dmMono.variable} dark bg-background font-sans text-foreground antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
