import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const navInactiveClass = 'text-zinc-300 hover:text-zinc-100';

function SidebarContent({
  isPublicThread,
  user,
  homeActive,
  topicsActive,
  onLogout,
}: {
  isPublicThread: boolean;
  user: { email?: string | null } | null;
  homeActive: boolean;
  topicsActive: boolean;
  onLogout: () => void;
}) {
  return (
    <>
      <Link to="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-full hover:bg-zinc-900 text-inherit">
        <img src="/learning-icon.svg" alt="" className="h-8 w-8 text-zinc-100 [filter:invert(1)]" />
        <span className="text-xl font-bold tracking-tight">DeepLearn</span>
      </Link>

      {!isPublicThread && (
        <>
          <nav className="mt-4 flex flex-col gap-1">
            <Link
              to="/"
              className={`px-3 py-2 rounded-full text-[0.95rem] font-semibold hover:bg-zinc-900 ${homeActive ? '' : navInactiveClass}`}
            >
              Home
            </Link>
            <Link
              to="/topics"
              className={`px-3 py-2 rounded-full text-[0.95rem] font-semibold hover:bg-zinc-900 ${topicsActive ? '' : navInactiveClass}`}
            >
              My topics
            </Link>
          </nav>

          <div className="mt-4 px-3">
            <Link
              to="/topics"
              className="block w-full text-center px-4 py-3 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white transition"
            >
              Generate
            </Link>
          </div>
        </>
      )}

      <div className="mt-auto px-3 pb-2">
        {isPublicThread ? (
          <Link
            to="/login"
            className="block w-full text-center px-4 py-3 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white transition"
          >
            Sign in
          </Link>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="m-0 text-xs text-zinc-500">Signed in as</p>
            <p className="m-0 mt-1 text-sm font-medium truncate">{user?.email}</p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 w-full px-3 py-2 text-sm rounded-full border border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTopic, setSearchTopic] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isTopics = location.pathname.startsWith('/topics');
  const isThread = location.pathname.startsWith('/thread/');
  const isPublicThread = isThread && !user;
  const headerTitle = isThread ? 'Post' : isTopics ? 'My topics' : 'Home';
  const homeActive = !isTopics && !isThread;
  const topicsActive = isTopics;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const topic = searchTopic.trim();
    if (!topic) return;
    setSearchTopic('');
    navigate('/topics', { state: { topic } });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className={`grid gap-6 ${isPublicThread ? 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]' : 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]'}`}>
          {/* Left sidebar – logo always; nav + account or Sign in (desktop) */}
          <aside className="hidden lg:block sticky top-0 h-screen py-4">
            <div className="flex h-full flex-col">
              <SidebarContent
                isPublicThread={isPublicThread}
                user={user}
                homeActive={homeActive}
                topicsActive={topicsActive}
                onLogout={handleLogout}
              />
            </div>
          </aside>

          {/* Mobile menu overlay */}
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                aria-hidden
                onClick={() => setMobileMenuOpen(false)}
              />
              <aside
                className="fixed left-0 top-0 z-50 h-full w-[260px] max-w-[85vw] bg-black border-r border-zinc-800/80 py-4 flex flex-col lg:hidden"
                aria-label="Main menu"
              >
                <div className="flex h-full flex-col px-2">
                  <SidebarContent
                    isPublicThread={isPublicThread}
                    user={user}
                    homeActive={homeActive}
                    topicsActive={topicsActive}
                    onLogout={handleLogout}
                  />
                </div>
              </aside>
            </>
          )}

          {/* Center column */}
          <main className="min-h-screen lg:border-x border-zinc-800/80">
            <header className="sticky top-0 z-10 backdrop-blur bg-black/70 border-b border-zinc-800/80">
              <div className="px-4 py-3 flex items-center gap-3">
                {isThread && (
                  <Link to="/" className="text-zinc-300 no-underline hover:text-white shrink-0">
                    ←
                  </Link>
                )}
                <span className="font-semibold text-[1.05rem] min-w-0 truncate">
                  {headerTitle}
                </span>
                {!isPublicThread && (
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <span className="text-xs text-zinc-500 truncate max-w-[120px] sm:max-w-[45%]">
                      {user?.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(true)}
                      className="lg:hidden p-2 -m-2 rounded-full hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-100"
                      aria-label="Open menu"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </header>

            <div className="px-4">
              <Outlet />
            </div>
          </main>

          {/* Right sidebar – hidden for public thread view */}
          {!isPublicThread && (
          <aside className="hidden lg:block sticky top-0 h-screen py-4">
            <div className="space-y-4">
              <form onSubmit={handleSearchSubmit} className="rounded-full border border-zinc-800 bg-zinc-950/60 px-4 py-2">
                <input
                  type="text"
                  placeholder="What do you want to learn today?"
                  value={searchTopic}
                  onChange={(e) => setSearchTopic(e.target.value)}
                  maxLength={500}
                  className="w-full bg-transparent outline-none text-sm placeholder:text-zinc-500"
                />
              </form>

              <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <h3 className="m-0 text-sm font-semibold">Tips</h3>
                <p className="m-0 mt-2 text-sm text-zinc-400 leading-relaxed">
                  Generate threads for a topic, then open one to read replies and ask follow-up questions.
                </p>
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <h3 className="m-0 text-sm font-semibold">What’s happening</h3>
                <ul className="mt-3 space-y-3 text-sm text-zinc-400">
                  <li>
                    <p className="m-0 text-xs text-zinc-500">Try a topic</p>
                    <p className="m-0 font-medium text-zinc-200">“React hooks”</p>
                  </li>
                  <li>
                    <p className="m-0 text-xs text-zinc-500">Or</p>
                    <p className="m-0 font-medium text-zinc-200">“SQL indexing”</p>
                  </li>
                  <li>
                    <p className="m-0 text-xs text-zinc-500">Or</p>
                    <p className="m-0 font-medium text-zinc-200">“System design”</p>
                  </li>
                </ul>
              </section>
            </div>
          </aside>
          )}
        </div>
      </div>
    </div>
  );
}
