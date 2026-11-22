import { useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import type { AdminUserPublic } from '../../types/store';
import { loginAdminApi, setupInitialOwnerApi } from '../../utils/api';
import { BrandLogo } from '../BrandLogo';
import { PWAInstallButton } from '../PWAInstallUI';

interface AdminAuthScreenProps {
  brandName: string;
  needsInitialSetup: boolean;
  envPasscodeActive: boolean;
  onAuthenticated: (user: AdminUserPublic) => void;
  onBackToStore: () => void;
}

export function AdminAuthScreen({
  brandName,
  needsInitialSetup,
  envPasscodeActive,
  onAuthenticated,
  onBackToStore,
}: AdminAuthScreenProps) {
  const [username, setUsername] = useState('vlasnik');
  const [displayName, setDisplayName] = useState('Vlasnik butika');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsInitialSetup) {
      if (password.trim().length < 4) {
        setError('Lozinka / PIN mora imati najmanje 4 karaktera.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Lozinke se ne poklapaju.');
        return;
      }
      setLoading(true);
      try {
        const res = await setupInitialOwnerApi({
          username: username.trim() || 'vlasnik',
          displayName: displayName.trim() || 'Vlasnik butika',
          password: password.trim(),
        });
        onAuthenticated(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Greška pri kreiranju naloga.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password.trim()) {
      setError('Unesite lozinku ili PIN.');
      return;
    }

    setLoading(true);
    try {
      const res = await loginAdminApi({
        username: username.trim() || undefined,
        password: password.trim(),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijava nije uspela.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-[#E6E2D8] rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackToStore}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6862] hover:text-[#121212] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Prodavnica</span>
          </button>
          <PWAInstallButton />
        </div>

        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo brandName={brandName} logoMonogram="MP" size="sm" showSubtitle={false} />
          </div>
          <div className="w-10 h-10 rounded-full bg-[#121212] text-white flex items-center justify-center mx-auto">
            {needsInitialSetup ? (
              <ShieldCheck className="w-4 h-4 text-[#C5A059]" aria-hidden="true" />
            ) : (
              <KeyRound className="w-4 h-4" aria-hidden="true" />
            )}
          </div>
          <h1 className="font-editorial text-xl font-semibold text-[#121212]">
            {brandName} Admin
          </h1>
          <p className="text-xs text-[#6B6862] mt-1 leading-relaxed">
            {needsInitialSetup
              ? 'Prvo pokretanje: podesite lozinku ili PIN vlasnika prodavnice. Nakon podešavanja ovaj ekran se trajno zaključava.'
              : envPasscodeActive
                ? 'Prijava putem serverske lozinke okruženja (ADMIN_PASSCODE).'
                : 'Unesite korisničko ime i lozinku / PIN za upravljanje prodavnicom.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {needsInitialSetup && (
            <div>
              <label className="block text-[11px] font-semibold text-[#121212] mb-1">
                Ime i prezime / Naziv prikaza
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-sm"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="admin-username"
              className="block text-[11px] font-semibold text-[#121212] mb-1"
            >
              Korisničko ime {needsInitialSetup ? '*' : '(opciono za vlasnika)'}
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="vlasnik"
              className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-[11px] font-semibold text-[#121212] mb-1"
            >
              {needsInitialSetup ? 'Nova lozinka / PIN (min 4 karaktera) *' : 'Lozinka / PIN *'}
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete={needsInitialSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••"
              className="w-full h-11 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-sm font-semibold tracking-widest"
            />
          </div>

          {needsInitialSetup && (
            <div>
              <label
                htmlFor="admin-confirm-password"
                className="block text-[11px] font-semibold text-[#121212] mb-1"
              >
                Potvrdite lozinku / PIN *
              </label>
              <input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••"
                className="w-full h-11 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-sm font-semibold tracking-widest"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-[#9F1239] text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
          >
            {loading
              ? 'Provera...'
              : needsInitialSetup
                ? 'Kreiraj vlasnički nalog i uđi'
                : 'Otključaj Admin Panel'}
          </button>
        </form>
      </div>
    </div>
  );
}
