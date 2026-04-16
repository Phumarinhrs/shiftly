import { useState, useEffect, useRef } from 'react';
import { ConfigProvider } from 'antd';
import thTH from 'antd/locale/th_TH';
import ScheduleBuilder from './pages/ScheduleBuilder';
import Home from './pages/Home';

type Page = 'home' | 'schedule';

function ShiftlyLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
        <rect x="0"  y="0"    width="16" height="5" rx="2.5" fill="#007AFF" />
        <rect x="6"  y="8.5"  width="16" height="5" rx="2.5" fill="#007AFF" opacity="0.6" />
        <rect x="12" y="17"   width="16" height="5" rx="2.5" fill="#007AFF" opacity="0.3" />
      </svg>
      <span style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.3px' }}>
        Shiftly
      </span>
    </div>
  );
}

// Direction: 'forward' = slide left, 'back' = slide right
function PageTransition({ children, pageKey }: { children: React.ReactNode; pageKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevKey = useRef(pageKey);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const direction = pageKey === 'home' ? 'back' : 'forward';
    const fromX = direction === 'forward' ? 32 : -32;

    el.animate(
      [
        { opacity: 0, transform: `translateY(${fromX > 0 ? 12 : -4}px) scale(0.98)` },
        { opacity: 1, transform: 'translateY(0px) scale(1)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
    );

    prevKey.current = pageKey;
  }, [pageKey]);

  return (
    <div ref={ref} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>('home');
  const [navVisible, setNavVisible] = useState(false);

  const navigate = (next: Page) => {
    setPage(next);
  };

  // Animate back button in/out
  useEffect(() => {
    setNavVisible(page !== 'home');
  }, [page]);

  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: '#007AFF',
          colorBgContainer: 'rgba(255,255,255,0.7)',
          borderRadius: 12,
          borderRadiusLG: 16,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          colorBorder: 'rgba(0,0,0,0.08)',
        },
        components: {
          Button: { borderRadius: 20, controlHeight: 38, paddingContentHorizontal: 20 },
          Card: { borderRadiusLG: 16 },
          Modal: { borderRadiusLG: 20 },
          Select: { borderRadius: 10 },
          Input: { borderRadius: 10 },
          Table: { borderRadius: 12 },
        },
      }}
    >
      <div className="app-root">
        {/* Glass Navbar */}
        <nav className="glass-nav">
          <span className="nav-logo" onClick={() => navigate('home')}>
            <ShiftlyLogo />
          </span>

          <button
            className="nav-back"
            onClick={() => navigate('home')}
            style={{
              opacity: navVisible ? 1 : 0,
              transform: navVisible ? 'translateX(0)' : 'translateX(8px)',
              transition: 'opacity 0.25s ease, transform 0.25s ease',
              pointerEvents: navVisible ? 'auto' : 'none',
            }}
          >
            ‹ หน้าหลัก
          </button>
        </nav>

        {/* Pages */}
        <main className="app-main">
          <PageTransition pageKey={page}>
            {page === 'home' && <Home onNavigate={navigate} />}
            {page === 'schedule' && <ScheduleBuilder />}
          </PageTransition>
        </main>
      </div>
    </ConfigProvider>
  );
}

export default App;
