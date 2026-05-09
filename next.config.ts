import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['pdf-to-img', '@napi-rs/canvas', 'ffmpeg-static'],
};

export default nextConfig;
