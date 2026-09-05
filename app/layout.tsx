import type { Metadata } from "next";
import "./globals.css";
import "./nexa-responsive.css";

export const metadata: Metadata = {
  title: "NEXA GROUP | Gestión comercial",
  description: "Ventas, inventario, operaciones y finanzas conectadas en un solo lugar.",
  manifest: "/manifest.json",
  icons: { icon: "/nexa-group-logo.png", apple: "/nexa-group-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
