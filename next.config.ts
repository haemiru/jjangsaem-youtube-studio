import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    '@remotion/compositor-linux-x64-gnu',
    '@remotion/compositor-linux-x64-musl',
    '@remotion/compositor-linux-arm64-gnu',
    '@remotion/compositor-linux-arm64-musl',
    '@remotion/compositor-darwin-x64',
    '@remotion/compositor-darwin-arm64',
    '@remotion/compositor-win32-x64',
  ],
};

export default nextConfig;
