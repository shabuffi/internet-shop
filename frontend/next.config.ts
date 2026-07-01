import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Убираем плавающий индикатор Next.js в углу (виден только в dev-режиме)
  devIndicators: false,
};

export default nextConfig;
