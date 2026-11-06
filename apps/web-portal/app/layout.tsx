import type { Metadata } from "next";
import { AppProvider } from "@/lib/hooks/useApp";
import { MainLayout } from "@/components/layouts/MainLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise CAFM Platform",
  description: "Computer-Aided Facility Management & SmartPM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <MainLayout>{children}</MainLayout>
        </AppProvider>
      </body>
    </html>
  );
}
