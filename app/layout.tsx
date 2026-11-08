import type { Metadata } from "next";
import "./globals.css";

// 한글 글꼴은 public/fonts/text 의 묶음 파일을 globals.css @font-face 로 직접 불러옴 (오프라인·상대경로 안전)

export const metadata: Metadata = {
  title: "DO-ABLE BRAND SYSTEM — CULINARY CITY SOKCHO",
  description:
    "음식문화도시 속초의 감각을 시각화하는 브랜드 시스템. 키패드를 통해 맛과 식감의 상징적 조합을 경험해보세요.",
  keywords: ["속초", "DO-ABLE", "BRAND", "SYSTEM", "맛", "BI", "감각", "시각화"],
  openGraph: {
    title: "DO-ABLE BRAND SYSTEM — CULINARY CITY SOKCHO",
    description: "음식문화도시 속초의 감각을 시각화하는 브랜드 시스템",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark font-noto">
      <body className="font-noto">{children}</body>
    </html>
  );
}
