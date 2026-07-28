import React from 'react'
import { productName } from '@/config/product'
import './styles.css'

export const metadata = {
  description: 'A lightweight, self-hosted database access manager.',
  icons: {
    icon: '/dbmason-mark.svg',
  },
  robots: {
    follow: false,
    index: false,
  },
  title: productName,
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  )
}
