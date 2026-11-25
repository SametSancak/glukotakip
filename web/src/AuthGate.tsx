import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Syringe, LogOut } from 'lucide-react';
import { supabase } from './supabase';
import App from './App';

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setErrorMsg(error.message);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Yükleniyor...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 text-white p-2.5 rounded-xl">
              <Syringe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">GlukoTakip</h1>
              <p className="text-xs text-slate-500">{isSignUp ? 'Yeni Hesap Oluştur' : 'Hesabına Giriş Yap'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="E-posta adresi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Şifre (en az 6 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {errorMsg && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg">{errorMsg}</p>}
            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl font-medium text-sm transition cursor-pointer"
            >
              {isSignUp ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>
          </form>

          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
            }}
            className="w-full text-center text-xs text-teal-700 hover:underline cursor-pointer"
          >
            {isSignUp ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Yeni hesap oluştur'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-slate-900 text-slate-200 text-xs px-4 py-2 flex items-center justify-between print:hidden">
        <span>Oturum: <strong>{session.user.email}</strong></span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-1 text-rose-300 hover:text-rose-200 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Çıkış Yap
        </button>
      </div>
      <App key={session.user.id} />
    </div>
  );
}