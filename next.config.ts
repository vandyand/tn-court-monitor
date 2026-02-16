import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["got-scraping", "header-generator", "got", "http2-wrapper"],
};

export default nextConfig;
