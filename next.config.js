/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    // bullmq optionally depends on @valkey/valkey-glide which is not installed; it's only used for Valkey Glide backend
    config.resolve.fallback = { ...config.resolve.fallback, '@valkey/valkey-glide': false }
    config.externals = [...(config.externals || []), { '@valkey/valkey-glide': 'commonjs @valkey/valkey-glide' }]
    return config
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com',
      },
    ],
  },
}

module.exports = nextConfig