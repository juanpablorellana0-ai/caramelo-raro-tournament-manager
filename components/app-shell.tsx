import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Panel" },
  { href: "/organizer", label: "Organizador" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Caramelo Raro, inicio">
          <span className="brand-mark" aria-hidden="true">CR</span>
          <span className="brand-copy">
            <span className="brand-name">Caramelo Raro</span>
            <span className="brand-product">Tournament Manager</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="Navegación principal">
          {navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="account-label">Modo organizador</span>
      </header>
      <main className="main-content">{children}</main>
      <footer className="footer">Caramelo Raro <span>·</span> Gestión de torneos</footer>
    </div>
  );
}