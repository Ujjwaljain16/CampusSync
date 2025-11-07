import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Ensure Next.js treats this app directory as the workspace root
  outputFileTracingRoot: path.join(__dirname),

  // =====================================================
  // PRODUCTION SECURITY HEADERS
  // =====================================================
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // =====================================================
  // IMAGE OPTIMIZATION
  // =====================================================
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },

  // =====================================================
  // PRODUCTION OPTIMIZATIONS
  // =====================================================
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // =====================================================
  // EXPERIMENTAL FEATURES
  // =====================================================
  // Consolidate experimental flags in one object to avoid accidental overrides.
  // We explicitly disable Next's CSS optimizer (Critters) to avoid parsing errors
  // for modern color functions such as `oklch(...)`. This is a pragmatic
  // workaround; long-term fixes include upgrading Critters/csstree or emitting
  // legacy color formats.
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
    optimizeCss: false,
  },
};

export default nextConfig;
