'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  user?: {
    email?: string;
    name?: string;
    role?: string;
  } | null;
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navigation = user
    ? [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Upload', href: '/student/upload' },
        { name: 'Portfolio', href: '/public/portfolio' },
      ]
    : [
        { name: 'Features', href: '#features' },
        { name: 'How It Works', href: '#how-it-works' },
        { name: 'Pricing', href: '#pricing' },
      ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Only handle smooth scrolling for hash links on the current page
    if (href.startsWith('#')) {
      e.preventDefault();
      const element = document.querySelector(href);
      if (element) {
        const headerOffset = 100; // Account for fixed header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
        setMobileMenuOpen(false);
      }
    }
  };

  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled 
        ? "py-2" 
        : "py-4"
    )}>
      <div className={cn(
        "mx-auto max-w-7xl px-4 lg:px-8 transition-all duration-300",
        scrolled && "px-4"
      )}>
        <nav 
          className={cn(
            "flex items-center justify-between gap-x-6 rounded-2xl px-6 py-3 transition-all duration-300",
            scrolled
              ? "bg-slate-950/90 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20"
              : "bg-slate-950/50 backdrop-blur-md border border-white/5"
          )}
          aria-label="Global"
        >
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-3 group">
            {/* Minimalist approach - no container, just the logo */}
            <div className="relative w-9 h-9 transition-all duration-300 group-hover:scale-110">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={36}
                height={36}
                className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-110 group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                priority
              />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors duration-300">
                CampusSync
              </span>
              <span className="text-[10px] font-medium text-gray-400 tracking-wider uppercase">
                Verified Credentials
              </span>
            </div>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-lg p-2.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open main menu</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:gap-x-10">
          {navigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={cn(
                "text-[15px] font-medium transition-all duration-300 hover:text-white hover:scale-105 relative group cursor-pointer",
                pathname === item.href
                  ? "text-white"
                  : "text-white/70"
              )}
            >
              {item.name}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-emerald-400 group-hover:w-full transition-all duration-300"></span>
            </a>
          ))}
        </div>

        {/* Right side actions */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-6 lg:items-center">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <User className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-white/80">{user.email}</span>
                {user.role && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {user.role}
                  </span>
                )}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 hover:border-white/20 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              )}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[15px] font-medium text-white/80 hover:text-white transition-all hover:scale-105"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 px-6 py-2.5 text-[15px] font-semibold text-white shadow-lg hover:shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                <span className="relative z-10">Get started</span>
              </Link>
            </>
          )}
        </div>
      </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10">
          <div className="space-y-2 px-4 py-6">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className={cn(
                  "block rounded-lg px-3 py-2 text-base font-medium transition-colors cursor-pointer",
                  pathname === item.href
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                {item.name}
              </a>
            ))}
            
            {user ? (
              <>
                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/80">
                    <User className="w-4 h-4" />
                    {user.email}
                  </div>
                </div>
                {onLogout && (
                  <button
                    onClick={() => {
                      onLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                )}
              </>
            ) : (
              <div className="pt-4 space-y-2 border-t border-white/10">
                <Link
                  href="/login"
                  className="block rounded-lg px-3 py-2 text-base font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="block rounded-lg bg-gradient-to-r from-blue-500 to-emerald-500 px-3 py-2 text-base font-medium text-white text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
