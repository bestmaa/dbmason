import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const allowedDevOrigins =
  process.env.DEV_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []
const unusedRuntimePackages = [
  '**/node_modules/.pnpm/@img+sharp-*/**/*',
  '**/node_modules/.pnpm/sharp@*/**/*',
  '**/node_modules/.pnpm/stackback@*/**/*',
  '**/node_modules/.pnpm/why-is-node-running@*/**/*',
  '**/node_modules/@img/sharp-*',
  '**/node_modules/@img/sharp-*/**/*',
  '**/node_modules/sharp',
  '**/node_modules/sharp/**/*',
  '**/node_modules/stackback',
  '**/node_modules/stackback/**/*',
  '**/node_modules/why-is-node-running',
  '**/node_modules/why-is-node-running/**/*',
]
export const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

export const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  output: 'standalone',
  outputFileTracingExcludes: {
    '/*': unusedRuntimePackages,
    'next-server': unusedRuntimePackages,
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    unoptimized: true,
  },
  headers: async () => [{ headers: securityHeaders, source: '/:path*' }],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
  poweredByHeader: false,
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
