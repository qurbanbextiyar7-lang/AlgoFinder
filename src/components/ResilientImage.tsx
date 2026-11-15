import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function ResilientImage({
  src,
  alt,
  className = '',
  fallbackLabel,
}: ResilientImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [stage, setStage] = useState<'direct' | 'proxy' | 'failed'>('direct');

  useEffect(() => {
    setCurrentSrc(src);
    setStage('direct');
  }, [src]);

  const handleError = () => {
    if (stage === 'direct' && src && !src.startsWith('/api/image-proxy')) {
      setStage('proxy');
      setCurrentSrc(`/api/image-proxy?url=${encodeURIComponent(src)}`);
    } else {
      setStage('failed');
    }
  };

  if (!src || stage === 'failed') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 p-4 text-center ${className}`}
        role="img"
        aria-label={alt || fallbackLabel || 'Görsel yüklenemedi'}
      >
        <ImageOff className="w-5 h-5 stroke-[1.75]" />
        {fallbackLabel && (
          <span className="text-xs text-slate-500 line-clamp-2 max-w-[180px]">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={handleError}
      className={className}
    />
  );
}
