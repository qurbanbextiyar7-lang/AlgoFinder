import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AlgoMailApp } from './components/AlgoMailApp.tsx';
import './index.css';

function Root() {
  const [mailOpen, setMailOpen] = useState(
    () => window.location.pathname.replace(/\/$/, '') === '/algomail'
  );

  useEffect(() => {
    const handlePopState = () => {
      setMailOpen(window.location.pathname.replace(/\/$/, '') === '/algomail');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openMail = () => {
    window.history.pushState({}, '', '/algomail');
    setMailOpen(true);
  };

  const closeMail = () => {
    if (window.location.pathname.replace(/\/$/, '') === '/algomail') {
      window.history.pushState({}, '', '/');
    }
    setMailOpen(false);
  };

  return (
    <>
      <App />

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
