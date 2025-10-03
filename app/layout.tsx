import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { AuthLoading } from '@/components/AuthLoading'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BAIN Dashboard',
  description: 'Business Analytics and Intelligence Network',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <AuthLoading />
          {children}
        </Providers>
      </body>
    </html>
  )
}
