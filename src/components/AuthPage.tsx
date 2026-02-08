import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';

const inputClass =
  'px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-800 text-inherit text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
const buttonClass =
  'mt-1 px-4 py-3 rounded-lg border border-zinc-600 bg-zinc-700 font-medium hover:bg-zinc-600 disabled:opacity-50';

type AuthMode = 'login' | 'signup';

const copy: Record<
  AuthMode,
  { title: string; description: string; passwordPlaceholder: string; submit: string; submitting: string; footer: string; otherLink: string; otherTo: string }
> = {
  login: {
    title: 'Log in',
    description: 'Use your email and password to access your feed on any device.',
    passwordPlaceholder: 'Password',
    submit: 'Log in',
    submitting: 'Signing in…',
    footer: "Don't have an account?",
    otherLink: 'Sign up',
    otherTo: '/signup',
  },
  signup: {
    title: 'Sign up',
    description: 'Create an account to save your topics and threads and use them on any device.',
    passwordPlaceholder: 'Password (min 6 characters)',
    submit: 'Sign up',
    submitting: 'Creating account…',
    footer: 'Already have an account?',
    otherLink: 'Log in',
    otherTo: '/login',
  },
};

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const c = copy[mode];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        if (data.session?.access_token) {
          await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token ?? '',
            }),
          });
        }
        navigate('/', { replace: true });
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (err) throw err;
        if (data.user && !data.session) {
          setLoading(false);
          alert(
            'Account created. If your project has "Confirm email" enabled in Supabase, check your inbox (and spam) for a confirmation link before you can log in.'
          );
          navigate('/login', { replace: true });
          return;
        }
        if (data.session?.access_token) {
          await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token ?? '',
            }),
          });
        }
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (mode === 'login' && message.toLowerCase().includes('email not confirmed')) {
        setError(
          "Your email isn't confirmed yet. Check your inbox (and spam) for the confirmation link, or ask the site admin to disable \"Confirm email\" in Supabase Auth settings."
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-[360px] rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold m-0 mb-2">{c.title}</h1>
        <p className="text-zinc-400 text-sm mb-6 leading-snug">{c.description}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputClass}
          />
          <input
            type="password"
            placeholder={c.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'signup' ? 6 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={inputClass}
          />
          {error && <p className="text-red-400 text-sm m-0">{error}</p>}
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? c.submitting : c.submit}
          </button>
        </form>
        <p className="mt-5 text-sm text-zinc-400">
          {c.footer}{' '}
          <Link to={c.otherTo} className="text-blue-400 hover:underline">
            {c.otherLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
