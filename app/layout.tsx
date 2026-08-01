import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexoVenta | Gestión comercial",
  description: "Preventa, inventario, compras, cobranzas y análisis en un solo lugar.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
