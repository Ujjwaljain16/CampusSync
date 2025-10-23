import { Shield } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden flex items-center justify-center">
      {/* Animated Background */}
      <div className="absolute top-20 left-10 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10" />

      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl blur-lg opacity-40" />
            <div className="relative w-14 h-14 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
            </div>
          </div>
          <span className="text-3xl font-extrabold bg-gradient-to-r from-blue-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent animate-gradient tracking-tight">
            CampusSync
          </span>
        </div>

        {/* Loading Spinner */}
        <div className="relative mb-4">
          <div className="w-16 h-16 border-4 border-white/20 border-t-blue-400 border-b-emerald-400 rounded-full animate-spin mx-auto" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-emerald-400/60 rounded-full animate-spin mx-auto" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>

        {/* Loading Text */}
        <p className="text-white/80 text-lg font-semibold tracking-wide">
          Loading CampusSync...
        </p>

        {/* Progress Dots */}
        <div className="flex justify-center space-x-2 mt-4">
          <div className="w-2 h-2 bg-blue-400/70 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-emerald-400/70 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-cyan-400/70 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
}
