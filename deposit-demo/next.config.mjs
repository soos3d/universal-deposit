/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    // styled-components v6 references bare `React` global (build artifact bug).
    // ProvidePlugin injects `import React from 'react'` into any module that uses it.
    config.plugins.push(new webpack.ProvidePlugin({ React: 'react' }));
    return config;
  },
};

export default nextConfig;
