import React, { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';

interface GameLogoProps {
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export const GameLogo: React.FC<GameLogoProps> = ({ logoUrl, size = 'sm' }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const sizeClasses =
    size === 'lg'
      ? 'w-20 h-20 rounded-2xl'
      : size === 'md'
        ? 'w-12 h-12 rounded-xl'
        : 'w-9 h-9 rounded-xl';

  const iconClasses =
    size === 'lg' ? 'w-10 h-10' : size === 'md' ? 'w-6 h-6' : 'w-5 h-5';

  if (logoUrl && !imgError) {
    return (
      <div
        className={`${sizeClasses} bg-slate-900 border border-amber-500/40 overflow-hidden shrink-0 flex items-center justify-center`}
      >
        <img
          src={logoUrl}
          alt="እድል ቤት · Edil Bet Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses} bg-amber-500 text-slate-950 shrink-0 flex items-center justify-center`}
    >
      <Crown className={iconClasses} />
    </div>
  );
};
