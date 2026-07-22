import React from 'react'
import './styles.css'

export const metadata = {
  description: 'A lightweight, self-hosted database access manager.',
  title: 'DBMason',
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
