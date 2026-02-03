import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) throw err;
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-[360px] rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold m-0 mb-2">Sign up</h1>
        <p className="text-zinc-400 text-sm mb-6 leading-snug">
          Create an account to save your topics and threads and use them on any device.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-800 text-inherit text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-800 text-inherit text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-400 text-sm m-0">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 px-4 py-3 rounded-lg border border-zinc-600 bg-zinc-700 font-medium hover:bg-zinc-600 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-5 text-sm text-zinc-400">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
