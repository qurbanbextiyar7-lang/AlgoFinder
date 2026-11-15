import { useEffect, useState } from 'react';
import { ExternalLink, Globe, Image as ImageIcon, X } from 'lucide-react';
import type { ImageResult, ImageSearchResponse } from '../types';
import { ResilientImage } from './ResilientImage';

interface ImageSearchViewProps {
  data: ImageSearchResponse | null;
  loading: boolean;
  error: string | null;
  query: string;
  onOpenSite: (url: string) => void;
}

export function ImageSearchView({
  data,
  loading,
  error,
  query,
  onOpenSite,
}: ImageSearchViewProps) {
  const [selected, setSelected] = useState<ImageResult | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6" aria-busy="true">
        <div className="h-4 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[4/3] w-full bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-3.5 w-3/4 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Fotoğraf Arama</h2>
        <p className="text-sm text-slate-600">
          Yukarıdaki arama çubuğuna istediğiniz kelimeyi yazarak yüksek çözünürlüklü fotoğraflar
          arayabilirsiniz.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      {/* Unboxed Metadata Line */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-200 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">“{data.query || query}”</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{data.images.length} fotoğraf</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{data.durationMs} ms</span>
          {data.translatedQuery && (
            <>
              <span aria-hidden="true">·</span>
              <span>Genişletilen terim: {data.translatedQuery}</span>
            </>
          )}
        </div>
      </div>

      {data.images.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-base font-medium text-slate-800 mb-1">
            Bu arama için uygun fotoğraf bulunamadı
          </p>
          <p className="text-sm text-slate-500">
            Daha genel bir anahtar kelime (ör. “İstanbul”, “kahve”, “dağ manzarası”) deneyin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {data.images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelected(img)}
              className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl cursor-pointer"
            >
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <ResilientImage
                  src={img.thumbnailUrl}
                  alt={img.title}
                  fallbackLabel={img.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                />
              </div>
              <div className="mt-2 px-0.5">
                <div className="text-sm font-medium text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                  {img.title}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 tabular-nums">
                  <span className="truncate">{img.domain}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {img.width}×{img.height}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">
                  {selected.title}
                </h3>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 tabular-nums">
                  <span>{selected.domain}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selected.width}×{selected.height}
                  </span>
                  {selected.author && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[200px]">{selected.author}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Kapat"
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-900 flex items-center justify-center max-h-[65vh] overflow-hidden p-4">
              <ResilientImage
                src={selected.fullUrl}
                alt={selected.title}
                fallbackLabel={selected.title}
                className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  const target = selected.sourceUrl;
                  setSelected(null);
                  onOpenSite(target);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>Kaynak Sayfayı AlgoFind ile Aç</span>
              </button>
              <a
                href={selected.fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
              >
                <span>Görseli Yeni Sekmede Aç</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
