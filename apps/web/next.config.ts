import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@vms/ui'],
  async rewrites() {
    return [
      {
        source: '/app/vehicles',
        destination: '/vehicles',
      },
      {
        source: '/app/vehicles/new',
        destination: '/vehicles/new',
      },
      {
        source: '/app/vehicles/:vehicleId',
        destination: '/vehicles/:vehicleId',
      },
      {
        source: '/app/drivers',
        destination: '/drivers',
      },
      {
        source: '/app/drivers/new',
        destination: '/drivers/new',
      },
      {
        source: '/app/drivers/:driverId',
        destination: '/drivers/:driverId',
      },
    ];
  },
};

export default nextConfig;
