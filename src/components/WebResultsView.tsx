import { ArrowRight, BookOpen, ExternalLink, Globe, Image as ImageIcon, Search } from 'lucide-react';
import type { SearchResponse } from '../types';
import { ResilientImage } from './ResilientImage';

interface WebResultsViewProps {
  data: SearchResponse | null;
  loading: boolean;
  error: string | null;
  onOpenSite: (url: string) => void;
  onSwitchToImages: () => void;
  onSearchTopic?: (topic: string) => void;
}

export function WebResultsView({
  data,
  loading,
  error,
  onOpenSite,
  onSwitchToImages,
  onSearchTopic,
}: WebResultsViewProps) {
  if (loading) {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6" aria-busy="true">
        <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="h-3.5 w-44 bg-slate-200 rounded animate-pulse" />
          <div className="h-5 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-5 w-11/12 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-4/5 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="h-3.5 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-6 w-2/3 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse pt-2" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <div className="p-6 bg-white border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const totalShown = (data.directMatch ? 1 : 0) + data.results.length;
  const report = data.researchReport;

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
      {/* Unboxed Meta Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">“{data.query}”</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {totalShown} açık web sonucu
            {report && report.sourcesAnalyzed.length > 0
              ? ` · ${report.sourcesAnalyzed.length} canlı kaynak okundu`
              : ''}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{data.durationMs} ms</span>
        </div>
        <span>
          {data.mode === 'research'
            ? 'Tam açık internet araştırması'
            : 'Popülerlik ve doğruluk odaklı sıralama'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column: Research Report + Top Featured Site + Curated Open-Web List */}
        <div className="lg:col-span-8 space-y-8">
          {/* Open-Internet Live Research Synthesis */}
          {report && (report.overview || report.keyFindings.length > 0) && (
            <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Açık İnternet Araştırma Sentezi</span>
                </div>
                {report.sourcesAnalyzed.length > 0 && (
                  <span className="tabular-nums">
                    {report.sourcesAnalyzed.length} canlı web sayfasından derlendi
                  </span>
                )}
              </div>

              {report.overview && (
                <p className="text-[15px] text-slate-800 leading-relaxed">{report.overview}</p>
              )}

              {report.keyFindings.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 mb-3">
                    Kaynaklardan Çıkarılan Temel Bulgular
                  </h3>
                  <ul className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
                    {report.keyFindings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="font-mono text-xs text-blue-600 font-semibold mt-0.5 shrink-0 tabular-nums">
                          {idx + 1}.
                        </span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.sourcesAnalyzed.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 mb-3">
                    Doğrudan Okunan Web Kaynakları
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {report.sourcesAnalyzed.map((src) => (
                      <button
                        key={src.url}
                        type="button"
                        onClick={() => onOpenSite(src.url)}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-300 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <span className="font-mono font-semibold text-blue-600">
                            [{src.index}]
                          </span>
                          <span className="font-mono truncate">{src.domain}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 line-clamp-1">
                          {src.title}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {report.relatedTopics.length > 0 && onSearchTopic && (
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 mr-1">Derinleştir:</span>
                  {report.relatedTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => onSearchTopic(`${data.query} ${topic}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                    >
                      <Search className="w-3 h-3 text-slate-500" />
                      <span>{topic}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* #1 En Popüler Sonuç */}
          {data.directMatch && (
            <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <span className="font-semibold text-blue-600">
                  {data.directMatch.popularityLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{data.directMatch.domain}</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 text-balance">
                <button
                  type="button"
                  onClick={() => onOpenSite(data.directMatch!.url)}
                  className="text-left hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {data.directMatch.title}
                </button>
              </h2>

              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                {data.directMatch.snippet}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenSite(data.directMatch!.url)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  <span>Site Açıcıda Aç</span>
                </button>
                <a
                  href={data.directMatch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <span>Direkt Siteye Git</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {/* Concise Summary when no full Research Report */}
          {!report && data.summary && (
            <div className="pb-6 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Hızlı Özet</h3>
              <p className="text-[15px] text-slate-800 leading-relaxed">{data.summary}</p>
            </div>
          )}

          {/* Curated Open-Web Popular Results List */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 mb-4">
              Açık İnternet Kaynakları ve Popüler Sonuçlar
            </h3>

            {data.results.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Bu arama için doğrudan en popüler tek kaynak yukarıda sunuldu.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.results.map((item) => (
                  <article key={item.id} className="py-5 first:pt-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <span className="font-mono text-slate-700">{item.domain}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.popularityLabel}</span>
                    </div>

                    <h4 className="text-lg font-semibold text-slate-900 mb-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenSite(item.url)}
                        className="text-left hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {item.title}
                      </button>
                    </h4>

                    <p className="text-sm text-slate-600 leading-relaxed mb-3 max-w-2xl">
                      {item.snippet}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => onOpenSite(item.url)}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Canlı Tarayıcıda Aç</span>
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        <span>Direkt Git</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side Column: Related Images Preview */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="p-5 bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ImageIcon className="w-4 h-4 text-slate-600" />
                <span>İlgili Fotoğraflar</span>
              </div>
              <button
                type="button"
                onClick={onSwitchToImages}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
              >
                <span>Tümünü Gör</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {data.relatedImages.length === 0 ? (
              <p className="text-xs text-slate-500">
                Bu sorgu için fotoğraf önizlemesi bulunamadı. Fotoğraf Arama sekmesinden daha geniş
                arama yapabilirsiniz.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {data.relatedImages.slice(0, 4).map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={onSwitchToImages}
                    className="group aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 cursor-pointer"
                  >
                    <ResilientImage
                      src={img.thumbnailUrl}
                      alt={img.title}
                      fallbackLabel={img.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
