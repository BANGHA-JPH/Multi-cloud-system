'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recaptchaVerified, setRecaptchaVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/login');
  }, [router]);

  // Password strength checker
  const getPasswordStrength = () => {
    if (!password) return { label: 'None', score: 0, color: 'bg-slate-800' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    switch (score) {
      case 1:
        return { label: 'Weak', score: 25, color: 'bg-rose-500' };
      case 2:
        return { label: 'Fair', score: 50, color: 'bg-amber-500' };
      case 3:
        return { label: 'Good', score: 75, color: 'bg-cyan-500' };
      case 4:
        return { label: 'Strong (AES Ready)', score: 100, color: 'bg-emerald-500' };
      default:
        return { label: 'Weak', score: 15, color: 'bg-rose-500' };
    }
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter your password.');
      setIsLoading(false);
      return;
    }

    if (!recaptchaVerified) {
      setErrorMsg('Please complete the reCAPTCHA bot verification step.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed. Please check your details.');
      }

      if (data.token) {
        localStorage.setItem('cloudfusion_token', data.token);
        localStorage.setItem('cloudfusion_user', JSON.stringify(data.user));
      }

      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to register account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col justify-center items-center relative overflow-hidden px-4 py-12 font-sans">
      {/* Background Glow Blobs */}
      <div className="absolute top-1/3 -right-20 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/3 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

      {/* Header Branding */}
      <div className="mb-6 text-center z-10">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 p-[1px] shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-[#0B0F19] rounded-[11px] flex items-center justify-center">
              <span className="material-symbols-outlined text-cyan-400 text-2xl group-hover:rotate-12 transition-transform duration-300">
                cloud_done
              </span>
            </div>
          </div>
          <span className="font-extrabold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Cloud<span className="text-cyan-400">Fusion</span>
          </span>
        </Link>
        <p className="text-xs text-slate-400 mt-1.5 font-medium uppercase tracking-wide">
          Deploy Your 52 GB Multi-Cloud Mesh Account
        </p>
      </div>

      {/* Glassmorphism Auth Card */}
      <div className="w-full max-w-lg bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl shadow-black/50 z-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-sm text-slate-400 mt-1">Free 52 GB combined storage across AWS, Google Drive, & Dropbox</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2.5 animate-fadeIn">
            <span className="material-symbols-outlined text-sm shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                person
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Alex Rivera"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@cloudfusion.io"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
            </div>
          </div>

          {/* Password & Strength Meter */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Master Encryption Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                lock
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            {/* Strength Bar */}
            {password && (
              <div className="mt-2">
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                  <span>Strength: {strength.label}</span>
                  <span>{strength.score}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${strength.color} transition-all duration-300`}
                    style={{ width: `${strength.score}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                lock_reset
              </span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
            </div>
          </div>

          {/* reCAPTCHA Bot Verification Widget */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recaptchaVerified}
                onChange={(e) => setRecaptchaVerified(e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-300">I am not a robot</span>
            </label>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="material-symbols-outlined text-cyan-400 text-base">verified_user</span>
              <span>reCAPTCHA v3</span>
            </div>
          </div>

          {/* Terms Checkbox */}
          <div className="text-xs text-slate-400 pt-1">
            By creating an account, you agree to CloudFusion's{' '}
            <a href="#" className="text-cyan-400 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-cyan-400 hover:underline">
              Privacy Policy
            </a>.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Creating Encrypted Mesh Account...</span>
              </>
            ) : (
              <>
                <span>Complete Registration</span>
                <span className="material-symbols-outlined text-base">how_to_reg</span>
              </>
            )}
          </button>
        </form>

        {/* Bottom Link */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <Link href="/login" prefetch={true} className="text-cyan-400 font-semibold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
