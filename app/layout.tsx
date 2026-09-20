import type { Metadata } from "next";
import { Cinzel, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Cinzel: display/heading font -- the engraved, ornate look from the card
// design. Barlow Condensed: body/UI font -- tall and compact, reads well in
// small labels (room codes, stats, buttons) without eating horizontal space.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cricattax",
  description:
    "Real-time multiplayer IPL fantasy draft game -- mystery-box card reveals, live squad building, and trading.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-felt text-silver font-body">
        {children}
      </body>
    </html>
  );
}
