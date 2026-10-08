"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { updateCandyEdge } from "@/components/candy-edge";

const navigation = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/organizer", label: "Organizador", icon: "organizer" },
] as const;

type NavigationProps = {
  pathname: string;
  onNavigate?: () => void;
};

function NavigationLinks({ pathname, onNavigate }: NavigationProps) {
  return (
    <>
      {navigation.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            className={`nav-link candy-edge${active ? " nav-link-active" : ""}`}
            href={item.href}
            key={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon === "dashboard" ? (
                <svg viewBox="0 0 20 20" fill="none">
                  <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
                  <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
                  <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
                  <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M4 3.5h12v13H4z" />
                  <path d="M7 7h6M7 10h6M7 13h3" />
                </svg>
              )}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentPage =
    navigation.find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
    )?.label ?? "Caramelo Raro";

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell" onPointerMove={updateCandyEdge}>
      <aside className="sidebar" aria-label="Navegación lateral">
        <Link className="brand" href="/" aria-label="Caramelo Raro, inicio">
          <Image
            className="brand-logo"
            src="/assets/caramelo-raro-logo.png"
            width={836}
            height={836}
            alt=""
          />
          <span className="brand-copy">
            <span className="brand-name">Caramelo Raro</span>
            <span className="brand-product">Tournament Manager</span>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          <p className="navigation-heading">Operaciones</p>
          <NavigationLinks pathname={pathname} />
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-mark" aria-hidden="true" />
          <span>Gestión de torneos</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={mobileNavigationOpen ? "Cerrar navegación" : "Abrir navegación"}
            aria-expanded={mobileNavigationOpen}
            aria-controls="mobile-primary-navigation"
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>

          <Link className="mobile-brand" href="/" aria-label="Caramelo Raro, inicio">
            <Image
              className="brand-logo"
              src="/assets/caramelo-raro-logo.png"
              width={836}
              height={836}
              alt=""
            />
            <span className="brand-copy">
              <span className="brand-name">Caramelo Raro</span>
              <span className="brand-product">Tournament Manager</span>
            </span>
          </Link>

          <p className="topbar-context" aria-live="polite">{currentPage}</p>
          <span className="account-label">Modo organizador</span>

          <nav
            id="mobile-primary-navigation"
            className="mobile-nav-panel"
            aria-label="Navegación principal"
            hidden={!mobileNavigationOpen}
          >
            <p className="navigation-heading">Operaciones</p>
            <NavigationLinks
              pathname={pathname}
              onNavigate={() => setMobileNavigationOpen(false)}
            />
          </nav>
        </header>

        <main className="main-content">{children}</main>
        <footer className="footer">
          Caramelo Raro <span>·</span> Gestión de torneos
        </footer>
      </div>
    </div>
  );
}
