import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "منصة المنافسة",
  description: "منصة منافسة طلابية تفاعلية قائمة على التخفي والكشف",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html dir="rtl" lang="ar" className={`${tajawal.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--stage-bg)] text-[var(--stage-fg)]">
        {children}
        <Toaster position="top-center" richColors dir="rtl" />
      </body>
    </html>
  );
}
