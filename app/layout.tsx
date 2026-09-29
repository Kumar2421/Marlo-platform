import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata={title:"Marlo Platform",description:"Marlo internal control plane"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Analytics /><SpeedInsights /></body></html>;}