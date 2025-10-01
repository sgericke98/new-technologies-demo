/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Configure image domains if needed
    domains: [],
  },
  // Preserve path aliases from Vite config
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './src'),
    };
    return config;
  },
};

module.exports = nextConfig;
