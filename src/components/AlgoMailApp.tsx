import { useEffect, useMemo, useState } from 'react';

type MailScreen = 'landing' | 'register' | 'login' | 'inbox' | 'compose';

type MailAccount = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  createdAt: number;
};

type MailMessage = {
  id: number;
  from: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
  starred: boolean;
};

const USERS_KEY = 'algomail_users_v1';
const ACTIVE_USER_KEY = 'algomail_active_user_v1';
const HASH_SALT = 'algomail-v1';

const SAMPLE_MESSAGES: MailMessage[] = [
  {
    id: 1,
    from: 'AlgoFind Ekibi',
    subject: 'Hesabınız için güvenlik uyarısı',
    preview: 'Yeni bir oturum tespit edildi. Hesabınızı güvenli tutmak için... ',
    body: 'Merhaba, hesabınıza yeni bir cihazdan giriş yapıldı. Güvenliğinizi sağlamak için şifrenizi güncellemenizi öneririz.',
    time: '10:45',
    unread: true,
    starred: true,
  },
  {
    id: 2,
    from: 'Ahmet Yılmaz',
    subject: 'Toplantı notları',
    preview: 'Dünkü toplantıda alınan kararlar ve paylaşım listesi.',
    body: 'Toplantı notları ektedir. Herkese iş bölümü ve sonraki adımlar yazıldı.',
    time: '09:20',
    unread: true,
    starred: false,
  },
  {
    id: 3,
    from: 'Medium',
    subject: 'Haftalık seçkiler',
    preview: 'Bu hafta ilginizi çekebilecek 5 içerik: Yapay zeka, tasarım ve üretkenlik.',
    body: 'Seçtiğimiz içerikler arasında tasarım, veri ve AI üzerine makaleler var.',
    time: 'Dün',
    unread: false,
    starred: false,
  },
  {
    id: 4,
    from: 'GitHub',
    subject: '[repo] Yeni pull request',
    preview: 'PR #42 incelenmeyi bekliyor. Geliştirme ekibi güncel durumu gözden geçiriyor.',
    body: 'Yeni pull request gönderildi. Uygulama ayarı ve test akışı incelenmek üzere bekliyor.',
    time: '22 Mar',
    unread: false,
    starred: false,
  },
];

function buildEmail(name: string, surname: string): string {
  const cleanName = name.trim().toLowerCase().replace(/\s+/g, '');
  const cleanSurname = surname.trim().toLowerCase().replace(/\s+/g, '');
  return `${cleanName}${cleanSurname}@afmail`;
}

async function hashPassword(password: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return `${HASH_SALT}:${password}`;
  }
  const bytes = new TextEncoder().encode(`${HASH_SALT}:${password}`);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readAccounts(): MailAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as MailAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: MailAccount[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
}

function readActiveUser(): MailAccount | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? (JSON.parse(raw) as MailAccount) : null;
  } catch {
    return null;
  }
}

function writeActiveUser(user: MailAccount | null) {
  if (!user) {
    localStorage.removeItem(ACTIVE_USER_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
}

export function AlgoMailApp() {
  const [screen, setScreen] = useState<MailScreen>('landing');
  const [activeUser, setActiveUser] = useState<MailAccount | null>(null);
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    captcha: '',
  });
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });
  const [registerError, setRegisterError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState({ to: '', subject: '', message: '' });
  const [messages, setMessages] = useState<MailMessage[]>(SAMPLE_MESSAGES);

  const captchaValue = useMemo(() => 428, []);

  useEffect(() => {
    const user = readActiveUser();
    if (user) {
      setActiveUser(user);
      setScreen('inbox');
    }
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!registerForm.firstName || !registerForm.lastName) {
      setRegisterError('İsim ve soyisim zorunludur.');
      return;
    }
    if (registerForm.password.length < 6) {
      setRegisterError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError('Şifreler eşleşmiyor.');
      return;
    }
    if (String(registerForm.captcha).trim() !== String(captchaValue)) {
      setRegisterError('CAPTCHA hatalı.');
      return;
    }

    const accounts = readAccounts();
    const email = buildEmail(registerForm.firstName, registerForm.lastName);
    const existing = accounts.find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      setRegisterError('Bu e-posta adresi kullanımda. Farklı bir isim deneyin.');
      return;
    }

    const passwordHash = await hashPassword(registerForm.password);
    const newUser: MailAccount = {
      id: crypto.randomUUID(),
      firstName: registerForm.firstName.trim(),
      lastName: registerForm.lastName.trim(),
      email,
      passwordHash,
      createdAt: Date.now(),
    };

    const updated = [...accounts, newUser];
    writeAccounts(updated);
    setActiveUser(newUser);
    writeActiveUser(newUser);
    setScreen('inbox');
    setRegisterForm({ firstName: '', lastName: '', password: '', confirmPassword: '', captcha: '' });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const accounts = readAccounts();
    const email = loginForm.email.trim().toLowerCase();
    const user = accounts.find((item) => item.email.toLowerCase() === email);
    if (!user) {
      setLoginError('Bu e-posta adresi bulunamadı.');
      return;
    }

    const hash = await hashPassword(loginForm.password);
    if (user.passwordHash !== hash) {
      setLoginError('Şifre hatalı.');
      return;
    }

    setActiveUser(user);
    writeActiveUser(user);
    setScreen('inbox');
  };

  const handleLogout = () => {
    setActiveUser(null);
    writeActiveUser(null);
    setScreen('landing');
  };

  const handleSendMail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeData.to.trim() || !composeData.subject.trim() || !composeData.message.trim()) {
      return;
    }

    const nextMessage: MailMessage = {
      id: Date.now(),
      from: activeUser ? activeUser.email : 'siz@afmail',
      subject: composeData.subject,
      preview: composeData.message.slice(0, 50),
      body: composeData.message,
      time: 'Şimdi',
      unread: false,
      starred: false,
    };

    setMessages((prev) => [nextMessage, ...prev]);
    setComposeData({ to: '', subject: '', message: '' });
    setComposeOpen(false);
    setScreen('inbox');
  };

  const currentEmail = activeUser ? activeUser.email : 'kullanici@afmail';

  return (
    <div className="algomail-shell">
      <style>{`
        .algomail-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #f6f8fc 0%, #edf3ff 100%);
          color: #1f2937;
          font-family: 'Google Sans', 'Segoe UI', sans-serif;
        }
        .algomail-wrapper {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }
        .algomail-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding: 10px 16px;
          background: rgba(255,255,255,0.8);
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 20px rgba(15,23,42,0.04);
        }
        .algomail-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          color: #1f2937;
        }
        .algomail-brand-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #dbeafe, #eff6ff);
          color: #2563eb;
          font-size: 1.2rem;
        }
        .algomail-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .algomail-user-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #edf2ff;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.82rem;
          color: #374151;
        }
        .algomail-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 700;
          background: linear-gradient(135deg, #2563eb, #60a5fa);
          color: white;
        }
        .algomail-card {
          display: flex;
          min-height: 80vh;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(255,255,255,0.8);
          border: 1px solid #e5e7eb;
          box-shadow: 0 10px 30px rgba(15,23,42,0.06);
        }
        .algomail-sidebar {
          width: 260px;
          background: #f8fafc;
          border-right: 1px solid #e5e7eb;
          padding: 18px 14px;
        }
        .algomail-compose {
          background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
          width: 100%;
          border: none;
          border-radius: 18px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          margin-bottom: 16px;
        }
        .algomail-nav-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 0.92rem;
          color: #334155;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .algomail-nav-item:hover {
          background: #edf2ff;
        }
        .algomail-nav-item.active {
          background: #dbeafe;
          color: #0f172a;
          font-weight: 600;
        }
        .algomail-nav-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .algomail-nav-badge {
          background: #e2e8f0;
          color: #475569;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.7rem;
        }
        .algomail-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: white;
        }
        .algomail-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid #e5e7eb;
          background: #fafcff;
        }
        .algomail-toolbar-left,
        .algomail-toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .algomail-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: none;
          display: grid;
          place-items: center;
          background: transparent;
          cursor: pointer;
          color: #475569;
          transition: background 0.15s ease;
        }
        .algomail-icon-btn:hover {
          background: #eef2ff;
        }
        .algomail-checkbox {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          border: 2px solid #94a3b8;
          background: white;
        }
        .algomail-content {
          flex: 1;
          overflow: auto;
          background: white;
        }
        .algomail-message-row {
          display: grid;
          grid-template-columns: 24px 24px 180px minmax(200px, 1fr) 90px;
          align-items: center;
          gap: 12px;
          padding: 10px 18px;
          border-bottom: 1px solid #f1f5f9;
          background: white;
          transition: background 0.15s ease;
          cursor: pointer;
        }
        .algomail-message-row:hover {
          background: #f8fafc;
        }
        .algomail-message-row.unread {
          background: #f3f7ff;
          font-weight: 700;
        }
        .algomail-message-row-star {
          color: #cbd5e1;
        }
        .algomail-message-row-star.starred {
          color: #fbbf24;
        }
        .algomail-message-sender {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.9rem;
        }
        .algomail-message-subject {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.9rem;
          color: #334155;
        }
        .algomail-message-snippet {
          color: #64748b;
          font-weight: 400;
        }
        .algomail-message-date {
          text-align: right;
          font-size: 0.8rem;
          color: #64748b;
        }
        .algomail-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 80vh;
          padding: 32px;
        }
        .algomail-box {
          width: min(100%, 520px);
          background: rgba(255,255,255,0.95);
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 16px 40px rgba(15,23,42,0.08);
        }
        .algomail-box h1 {
          font-size: clamp(2rem, 4vw, 2.5rem);
          line-height: 1.1;
          margin-bottom: 8px;
          color: #0f172a;
        }
        .algomail-box p {
          color: #475569;
          margin-bottom: 22px;
        }
        .algomail-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .algomail-two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .algomail-input {
          width: 100%;
          border: 1px solid #dfe7f5;
          background: #f8fbff;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 0.95rem;
          outline: none;
          transition: border 0.15s ease, box-shadow 0.15s ease;
        }
        .algomail-input:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.15);
        }
        .algomail-button {
          border: none;
          border-radius: 14px;
          padding: 12px 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .algomail-button:hover {
          transform: translateY(-1px);
        }
        .algomail-primary {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
        }
        .algomail-secondary {
          background: #e2e8f0;
          color: #1f2937;
        }
        .algomail-inline-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .algomail-error {
          color: #dc2626;
          font-size: 0.82rem;
          margin-top: -4px;
        }
        .algomail-captcha {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #f1f5f9;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 10px 12px;
          color: #475569;
          font-weight: 700;
          letter-spacing: 0.12em;
          width: fit-content;
        }
        .algomail-compose-panel {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.35);
          display: grid;
          place-items: center;
          z-index: 50;
          padding: 18px;
        }
        .algomail-compose-box {
          width: min(680px, 100%);
          background: white;
          border-radius: 22px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 28px 70px rgba(15,23,42,0.18);
          overflow: hidden;
        }
        .algomail-compose-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .algomail-compose-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 16px 18px 18px;
        }
        .algomail-compose-textarea {
          min-height: 180px;
          resize: vertical;
        }
        @media (max-width: 760px) {
          .algomail-card {
            flex-direction: column;
          }
          .algomail-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #e5e7eb;
          }
          .algomail-message-row {
            grid-template-columns: 24px 24px 1fr 70px;
          }
          .algomail-message-subject {
            grid-column: 3 / 5;
          }
        }
      `}</style>

      {screen === 'landing' && (
        <div className="algomail-wrapper">
          <div className="algomail-topbar">
            <div className="algomail-brand">
              <div className="algomail-brand-icon">✉</div>
              <span>AlgoMail</span>
            </div>
            <div className="algomail-header-right">
              <div className="algomail-user-badge">
                <span className="algomail-avatar">A</span>
                <span>AlgoFinder kullanıcıları</span>
              </div>
            </div>
          </div>

          <div className="algomail-panel">
            <div className="algomail-box">
              <h1>AlgoMail</h1>
              <p>
                Kişisel e-posta adresiniz <strong>@afmail</strong> alanında oluşturulur.
                <br />
                Kullanıcı adı, soyadı ve şifre ile güvenli bir şekilde hesabınızı oluşturabilirsiniz.
              </p>

              <div className="algomail-inline-actions">
                <button className="algomail-button algomail-primary" onClick={() => setScreen('register')}>
                  Hesap Oluştur
                </button>
                <button className="algomail-button algomail-secondary" onClick={() => setScreen('login')}>
                  Giriş Yap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen === 'register' && (
        <div className="algomail-wrapper">
          <div className="algomail-topbar">
            <div className="algomail-brand">
              <div className="algomail-brand-icon">✉</div>
              <span>AlgoMail</span>
            </div>
            <button className="algomail-button algomail-secondary" onClick={() => setScreen('landing')}>
              Geri Dön
            </button>
          </div>

          <div className="algomail-panel">
            <div className="algomail-box">
              <h1>Hesap Oluştur</h1>
              <p>İsim, soyisim, şifre ve güvenlik doğrulaması ile hesabınızı oluşturun.</p>

              <form onSubmit={handleRegister} className="algomail-form">
                <div className="algomail-two-col">
                  <input
                    className="algomail-input"
                    placeholder="İsim"
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, firstName: e.target.value }))}
                  />
                  <input
                    className="algomail-input"
                    placeholder="Soyisim"
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, lastName: e.target.value }))}
                  />
                </div>

                <input
                  type="password"
                  className="algomail-input"
                  placeholder="Şifre"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))}
                />

                <input
                  type="password"
                  className="algomail-input"
                  placeholder="Şifre Onayı"
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                />

                <div className="algomail-captcha">CAPTCHA: {captchaValue}</div>
                <input
                  className="algomail-input"
                  placeholder="CAPTCHA kodunu girin"
                  value={registerForm.captcha}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, captcha: e.target.value }))}
                />

                {registerError && <div className="algomail-error">{registerError}</div>}

                <button className="algomail-button algomail-primary" type="submit">
                  Hesabı Oluştur
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {screen === 'login' && (
        <div className="algomail-wrapper">
          <div className="algomail-topbar">
            <div className="algomail-brand">
              <div className="algomail-brand-icon">✉</div>
              <span>AlgoMail</span>
            </div>
            <button className="algomail-button algomail-secondary" onClick={() => setScreen('landing')}>
              Geri Dön
            </button>
          </div>

          <div className="algomail-panel">
            <div className="algomail-box">
              <h1>Giriş Yap</h1>
              <p>AlgoMail hesabınıza erişmek için e-posta adresinizi ve şifrenizi girin.</p>

              <form onSubmit={handleLogin} className="algomail-form">
                <input
                  className="algomail-input"
                  placeholder="ornek@afmail"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                />
                <input
                  type="password"
                  className="algomail-input"
                  placeholder="Şifre"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                />

                {loginError && <div className="algomail-error">{loginError}</div>}

                <button className="algomail-button algomail-primary" type="submit">
                  Giriş Yap
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {screen === 'inbox' && activeUser && (
        <div className="algomail-wrapper">
          <div className="algomail-topbar">
            <div className="algomail-brand">
              <div className="algomail-brand-icon">✉</div>
              <span>AlgoMail</span>
            </div>
            <div className="algomail-header-right">
              <div className="algomail-user-badge">
                <span className="algomail-avatar">
                  {activeUser.firstName.charAt(0).toUpperCase()}
                </span>
                <span>{currentEmail}</span>
              </div>
              <button className="algomail-button algomail-secondary" onClick={handleLogout}>
                Çıkış
              </button>
            </div>
          </div>

          <div className="algomail-card">
            <aside className="algomail-sidebar">
              <button className="algomail-compose" onClick={() => setComposeOpen(true)}>
                <span>✎</span>
                <span>Oluştur</span>
              </button>

              <div className="algomail-nav-item active">
                <div className="algomail-nav-left">
                  <span>📥</span>
                  <span>Gelen Kutusu</span>
                </div>
                <span className="algomail-nav-badge">{messages.filter((m) => m.unread).length}</span>
              </div>
              <div className="algomail-nav-item">
                <div className="algomail-nav-left">
                  <span>⭐</span>
                  <span>Yıldızlı</span>
                </div>
              </div>
              <div className="algomail-nav-item">
                <div className="algomail-nav-left">
                  <span>📤</span>
                  <span>Gönderilmiş</span>
                </div>
              </div>
              <div className="algomail-nav-item">
                <div className="algomail-nav-left">
                  <span>📝</span>
                  <span>Taslaklar</span>
                </div>
              </div>
            </aside>

            <main className="algomail-main">
              <div className="algomail-toolbar">
                <div className="algomail-toolbar-left">
                  <div className="algomail-checkbox" />
                  <button className="algomail-icon-btn" title="Yenile">↻</button>
                  <button className="algomail-icon-btn" title="Daha fazla">⋮</button>
                </div>
                <div className="algomail-toolbar-right">
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>1-4 / 4</span>
                  <button className="algomail-icon-btn" title="Önceki">‹</button>
                  <button className="algomail-icon-btn" title="Sonraki">›</button>
                </div>
              </div>

              <div className="algomail-content">
                {messages.map((msg) => (
                  <div key={msg.id} className={`algomail-message-row ${msg.unread ? 'unread' : ''}`}>
                    <div className="algomail-checkbox" />
                    <div className={`algomail-message-row-star ${msg.starred ? 'starred' : ''}`}>
                      {msg.starred ? '★' : '☆'}
                    </div>
                    <div className="algomail-message-sender">{msg.from}</div>
                    <div className="algomail-message-subject">
                      {msg.subject} <span className="algomail-message-snippet">- {msg.preview}</span>
                    </div>
                    <div className="algomail-message-date">{msg.time}</div>
                  </div>
                ))}
              </div>
            </main>
          </div>

          {composeOpen && (
            <div className="algomail-compose-panel">
              <div className="algomail-compose-box">
                <div className="algomail-compose-header">
                  <strong>Yeni Mesaj</strong>
                  <button className="algomail-icon-btn" onClick={() => setComposeOpen(false)}>
                    ✕
                  </button>
                </div>
                <form onSubmit={handleSendMail} className="algomail-compose-form">
                  <input
                    className="algomail-input"
                    placeholder="Kime: isim@afmail"
                    value={composeData.to}
                    onChange={(e) => setComposeData((p) => ({ ...p, to: e.target.value }))}
                  />
                  <input
                    className="algomail-input"
                    placeholder="Konu"
                    value={composeData.subject}
                    onChange={(e) => setComposeData((p) => ({ ...p, subject: e.target.value }))}
                  />
                  <textarea
                    className="algomail-input algomail-compose-textarea"
                    placeholder="Mesajınızı yazın..."
                    value={composeData.message}
                    onChange={(e) => setComposeData((p) => ({ ...p, message: e.target.value }))}
                  />
                  <div className="algomail-inline-actions">
                    <button className="algomail-button algomail-primary" type="submit">
                      Gönder
                    </button>
                    <button
                      type="button"
                      className="algomail-button algomail-secondary"
                      onClick={() => setComposeOpen(false)}
                    >
                      İptal
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AlgoMailApp;
