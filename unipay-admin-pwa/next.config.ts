import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.13'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.PAYMENT_SERVICE_URL || 'http://localhost:5000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;