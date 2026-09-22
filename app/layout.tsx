import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LANDBARON",
  description: "Property maintenance dashboard for small landlords and property operations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const currentYear = new Date().getFullYear();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-100 text-slate-900">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white/60 py-4 text-center text-xs text-slate-500">
          &copy;{currentYear} Landbaron Technologies
        </footer>
      </body>
    </html>
  );
}
