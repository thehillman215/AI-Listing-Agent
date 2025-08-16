/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: true,
  },
  // Ensure API routes work properly on Vercel
  api: {
    responseLimit: false,
  },
  // Static files serving
  async rewrites() {
    return [
      {
        source: '/((?!api/).*)',
        destination: '/public/$1', // Serve static files from public directory
      },
    ];
  },
};

export default nextConfig;