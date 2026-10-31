import type { Metadata } from "next";
import { AppProvider } from "@/components/AppContext";
import { Header } from "@/components/Header";
import { PromoBanner } from "@/components/PromoBanner";
import { Sidebar } from "@/components/Sidebar";
import localFont from "next/font/local";

import "./globals.css";

export const metadata: Metadata = {
  title: "Perf Lab · Revenue Analytics",
  description: "A deliberately slow internal analytics dashboard used as a performance-engineering lab.",
};


const inter = localFont({
  src: "./fonts/InterVariable-latin.woff2",
  weight: "100 900",     // a variable font: one file covers every weight
  display: "swap",       // the default; written out so you remember why
  variable: "--font-inter",
  preload: false,

});
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
<html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {/* PERF-BUG #5: a single god-context wraps the entire app. */}
        <AppProvider>
          <PromoBanner />
          <Header />
          <div className="md:flex">
            <Sidebar />
            <main className="min-w-0 flex-1 space-y-4 p-4 md:space-y-6 md:p-6">{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
