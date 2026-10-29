import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Studio Hub · Your next chapter",
  description: "Your private workspace for job discovery, role-specific resumes, and reviewed email follow-ups.",
  verification: { google: "czHP6Q6C3G_qWPhfdQoXX5W-Oda8VyGraG9NGfGeSxY" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
