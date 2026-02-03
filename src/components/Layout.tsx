import { Link, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
        <Link to="/" className="font-semibold text-lg text-inherit no-underline">
          Feed
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/" className="text-zinc-400 text-sm no-underline hover:text-zinc-100">
            My topics
          </Link>
          <span className="text-zinc-500 text-sm max-w-[180px] truncate">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-800 hover:border-zinc-600"
          >
            Log out
          </button>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-[600px] mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
