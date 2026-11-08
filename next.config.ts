import type { NextConfig } from "next";

// 상대 경로 빌드: 어떤 하위 경로(또는 로컬 폴더 서버)에 올려도 동작하도록 자산 경로를 상대로 둠
const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: '.',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
