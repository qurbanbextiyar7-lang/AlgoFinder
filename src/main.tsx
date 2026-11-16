import { useEffect, useState } from 'react';
import { Mail, UserRound, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AlgoMailApp } from './components/AlgoMailApp.tsx';
import './index.css';

function Root() {
  const [mailOpen, setMailOpen] = useState(
    () => window.location.pathname.replace(/\/$/, '') === '/algomail'
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setMailOpen(window.location.pathname.replace(/\/$/, '') === '/algomail');
      setProfileMenuOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openMail = () => {
    window.history.pushState({}, '', '/algomail');
    setMailOpen(true);
    setProfileMenuOpen(false);
  };

  const closeMail = () => {
    if (window.location.pathname.replace(/\/$/, '') === '/algomail') {
      window.history.pushState({}, '', '/');
    }
    setMailOpen(false);
    setProfileMenuOpen(false);
  };

  return (
    <>
      <App />

      {!mailOpen && (
        <div className="fixed right-5 top-5 z-[150]">
          <button
            type="button"
            onClick={() => setProfileMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-label="AlgoFinder profili ve menüsü"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-md transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            <UserRound className="h-4 w-4" />
            Profil
          </button>

          {profileMenuOpen && (
            <div
              role="menu"
              aria-label="AlgoFinder profil menüsü"
              className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
            >
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="text-sm font-semibold text-slate-900">AlgoFinder profili</p>
                <p className="mt-1 text-xs text-slate-500">Hesap ve uygulamalar</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={openMail}
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700">
                  <Mail className="h-4 w-4" />
                </span>
                <span>
                  <span className="block">AlgoMail</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">Afmail gelen kutunu aç</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {!mailOpen && (
        <button
          type="button"
          onClick={openMail}
          aria-label="AlgoMail'i aç"
          title="AlgoMail"
          className="fixed right-5 bottom-5 z-[100] inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          <Mail className="h-4 w-4" />
          AlgoMail
        </button>
      )}

      {mailOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#f6f8fc]">
          <button
            type="button"
            onClick={closeMail}
            aria-label="AlgoFinder'a dön"
            title="AlgoFinder'a dön"
            className="fixed right-4 top-4 z-[210] inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            <X className="h-4 w-4" />
            AlgoFinder'a dön
          </button>
          <AlgoMailApp />
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
