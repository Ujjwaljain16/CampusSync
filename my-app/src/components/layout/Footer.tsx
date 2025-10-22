import React from 'react';
import Image from 'next/image';
import { Github, Linkedin, Mail, Heart } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { name: 'GitHub', href: 'https://github.com', icon: Github },
    { name: 'LinkedIn', href: 'https://linkedin.com', icon: Linkedin },
    { name: 'Email', href: 'mailto:hello@campussync.com', icon: Mail },
  ];

  return (
    <footer className="bg-slate-950 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        {/* Main footer content */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Brand section */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9">
                <Image
                  src="/logo-clean.svg"
                  alt="CampusSync"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col -space-y-1">
                <span className="text-lg font-bold text-white">
                  CampusSync
                </span>
                <span className="text-[10px] font-medium text-gray-500 tracking-wider uppercase">
                  Verified Credentials
                </span>
              </div>
            </div>
            <p className="text-sm text-white/60 text-center md:text-left max-w-sm">
              Secure, cryptographically-verified credential management for students and institutions.
            </p>
          </div>

          {/* Social Links */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex space-x-6">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="text-white/60 hover:text-white transition-colors hover:scale-110 duration-200"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
            <p className="text-xs text-white/60 flex items-center gap-1">
              Made with <Heart className="h-3 w-3 text-red-500 fill-red-500 animate-pulse" /> for education
            </p>
          </div>
        </div>

        {/* Bottom section */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-xs text-white/60 text-center">
            &copy; {currentYear} CampusSync. A demo project showcasing W3C Verifiable Credentials.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
