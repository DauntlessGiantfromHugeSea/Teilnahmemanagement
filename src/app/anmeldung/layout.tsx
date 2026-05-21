import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anmeldung - FB-Akademie",
};

export default function AnmeldungLayout({ children }: { children: React.ReactNode }) {
  // Eigenes Layout ohne Shell, ohne Navigation - reine Standalone-Seite,
  // die per iframe in WordPress eingebettet werden kann.
  return <div className="bg-transparent">{children}</div>;
}
