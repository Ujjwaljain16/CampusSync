export default function Loading() {
  return (
    <div className="min-h-screen cv-primary-gradient flex items-center justify-center">
      <div className="text-center">
        {/* Logo */}
        <div className="flex items-center justify-center space-x-3 mb-8">
          <div className="w-12 h-12 cv-primary-gradient rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
            🔐
          </div>
          <span className="text-3xl font-extrabold cv-brand-gradient">CredentiVault</span>
        </div>

        {/* Loading Spinner */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-white/60 rounded-full animate-spin mx-auto" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        </div>

        {/* Loading Text */}
        <p className="text-white/90 text-lg font-medium">
          Loading your secure credentials...
        </p>
        
        {/* Progress Dots */}
        <div className="flex justify-center space-x-2 mt-4">
          <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-20 h-20 cv-success-gradient rounded-full opacity-20 cv-animate-pulse"></div>
        <div className="absolute top-40 right-20 w-16 h-16 cv-accent-gradient rounded-full opacity-30 cv-animate-pulse"></div>
        <div className="absolute bottom-32 left-20 w-24 h-24 bg-white/10 rounded-full opacity-40 cv-animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-18 h-18 cv-success-gradient rounded-full opacity-25 cv-animate-pulse"></div>
      </div>
    </div>
  );
}
