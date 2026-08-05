'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CloudFusionLandingPage() {
  const router = useRouter();

  useEffect(() => {
    // Pre-warm & pre-compile target routes for instantaneous navigation
    router.prefetch('/login');
    router.prefetch('/register');
    router.prefetch('/dashboard');

    // Micro-interaction for feature cards
    const handleMouseMove = (e: MouseEvent) => {
      document.querySelectorAll('.glass-panel').forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
        (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [router]);

  return (
    <div className="antialiased font-body-md text-body-md bg-background text-on-surface min-h-screen relative overflow-x-hidden">
      {/* Ambient Background Blobs */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="orb bg-primary w-[600px] h-[600px] top-[-300px] right-[-100px]" />
        <div className="orb bg-secondary-container w-[500px] h-[500px] bottom-[-200px] left-[-100px]" />
        <div className="orb bg-[#1a237e] w-[800px] h-[800px] top-[20%] left-[30%] opacity-30" />
      </div>

      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl border-b border-white/10 shadow-xl shadow-primary/5">
        <div className="flex justify-between items-center px-margin-desktop py-4 max-w-container-max mx-auto">
          <Link href="/" className="font-display-lg text-headline-md font-bold text-primary tracking-tighter">
            CloudFusion
          </Link>
          <div className="hidden md:flex gap-8 items-center">
            <Link className="font-label-lg text-label-lg text-primary border-b-2 border-primary pb-1" href="#features">
              Product
            </Link>
            <Link className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary transition-colors" href="#features">
              Features
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" prefetch={true} className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">
              Sign In
            </Link>
            <Link href="/register" prefetch={true} className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-lg text-label-lg shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative">
        {/* Hero Section */}
        <section className="relative pt-48 pb-stack-xl px-margin-desktop min-h-screen flex flex-col items-center justify-center text-center">
          <div className="absolute inset-0 z-0 overflow-hidden">
            <div className="hero-glow absolute inset-0" />
          </div>
          <div className="relative z-10 max-w-4xl mx-auto space-y-stack-lg">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border-white/5 text-primary-fixed font-label-md text-label-md mb-4 shimmer">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
              Introducing Fusion 2.0
            </div>
            <h1 className="font-display-xl text-display-xl text-on-surface leading-tight tracking-tight">
              One Cloud to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Rule Them All</span>
            </h1>
            <p className="font-body-xl text-body-xl text-on-surface-variant max-w-2xl mx-auto">
              Securely aggregate all your digital assets into a single high-performance fusion hub. Seamlessly manage, store, and analyze data across multiple providers.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-stack-md">
              <Link href="/register" prefetch={true} className="bg-primary text-on-primary px-10 py-4 rounded-full font-label-lg text-label-lg shadow-2xl shadow-primary/40 hover:scale-105 transition-transform active:scale-95">
                Get Started Free
              </Link>
              <Link href="#features" className="glass-panel text-on-surface px-10 py-4 rounded-full font-label-lg text-label-lg flex items-center gap-2 hover:bg-white/5 active:scale-95 transition-all">
                <span className="material-symbols-outlined">play_circle</span>
                Watch Demo
              </Link>
            </div>
          </div>
          {/* Hero Image/Visualization Placeholder */}
          <div className="relative z-10 mt-stack-xl w-full max-w-5xl aspect-[16/9] glass-panel rounded-xl overflow-hidden shadow-2xl group border border-white/10">
            <div
              className="w-full h-full bg-cover bg-center opacity-80 group-hover:scale-105 transition-transform duration-700"
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDac8TvVdzd_TCH6c8x0vnsUbbEGbujhIwq66pJp71dI46qwXUa0aRdMsoO7yMkaCbTCBkW8apMcIcIQHwwwV6kkZboCsizespJj_kNhn_AqmgwXtqYrbCk89TFuuMnXYO5MP67JIJF-F7kj_COHRgzWtJKFzblztI-YIZIrAWS-uHl3YLVIxX_6vmMzWafTYubzup97VSgbc6WRw9_17Rb46U_3JUAoHxEGY7rmERL9ZWV6PpbCyYOEkJmkMX7mmkNnSYdnxc_orc')",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
          </div>
        </section>

        {/* Feature Bento Grid */}
        <section id="features" className="py-stack-xl px-margin-desktop max-w-container-max mx-auto">
          <div className="text-center mb-stack-xl space-y-stack-sm">
            <h2 className="font-headline-lg text-headline-lg text-on-surface">The Intelligence of Fusion</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">Built for speed, security, and absolute control.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
            {/* Main Feature Card */}
            <div className="md:col-span-8 glass-panel rounded-xl p-8 flex flex-col justify-between min-h-[400px] group overflow-hidden border border-white/10">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[32px]">hub</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Intelligent Distribution</h3>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md">
                  Our proprietary algorithm shards and distributes your files across global nodes for zero-latency retrieval and infinite redundancy.
                </p>
              </div>
              <div className="mt-8 relative h-48 w-full bg-surface-container-low rounded-lg overflow-hidden border border-white/5">
                <div
                  className="w-full h-full bg-cover bg-center opacity-60 group-hover:scale-110 transition-transform duration-1000"
                  style={{
                    backgroundImage:
                      "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDlnFoZrIwt-pLR4zvO6PpUUQhx2CuOSnbqBWFoKCROV1roquaz0_pDpKmm2y5WwFwm-ruNMbOhGL3HwWQzf8W8UTr0wWru2R3UBxisN0JbJqPbh30Tz5ladwt-kxSoiL2QoZeRVmg6n7CdvMxNzS6DNWzuWLC3Ne7niaCaw6XfbLn7EeYyB0dLXnYBSPA7wtJgjlav5wPcM8jfmOzEN61Y4aGPjKsTA_yyyNvBgGk4yGvGgTZ_KtZVORJMKjs9Nb_ex9adRp6AgkM')",
                  }}
                />
              </div>
            </div>

            {/* Secondary Feature Card */}
            <div className="md:col-span-4 glass-panel rounded-xl p-8 flex flex-col space-y-6 group border border-white/10">
              <div className="w-12 h-12 rounded-lg bg-secondary-container/30 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[32px]">analytics</span>
              </div>
              <div className="flex-grow">
                <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Smart Analytics</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Real-time insights into your data lifecycle. Forecast storage needs and identify redundant assets with AI-driven reporting.
                </p>
              </div>
              <div className="h-32 bg-surface-container-high rounded-lg p-4 border border-white/5">
                {/* Tiny Chart Representation */}
                <div className="flex items-end gap-1 h-full w-full">
                  <div className="w-full bg-primary/40 rounded-t-sm group-hover:h-[80%] transition-all duration-500" style={{ height: '40%' }} />
                  <div className="w-full bg-primary/60 rounded-t-sm group-hover:h-[60%] transition-all duration-500" style={{ height: '20%' }} />
                  <div className="w-full bg-primary/80 rounded-t-sm group-hover:h-[90%] transition-all duration-500" style={{ height: '50%' }} />
                  <div className="w-full bg-primary rounded-t-sm group-hover:h-[70%] transition-all duration-500" style={{ height: '30%' }} />
                  <div className="w-full bg-secondary rounded-t-sm group-hover:h-[100%] transition-all duration-500" style={{ height: '60%' }} />
                </div>
              </div>
            </div>

            {/* Security Feature Card */}
            <div className="md:col-span-4 glass-panel rounded-xl p-8 flex flex-col space-y-6 border border-white/10">
              <div className="w-12 h-12 rounded-lg bg-error-container/30 flex items-center justify-center text-error">
                <span className="material-symbols-outlined text-[32px]">shield_lock</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Military-Grade Security</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  AES-256 encryption at rest and in transit. Zero-knowledge architecture ensures that only you have the keys to your digital kingdom.
                </p>
              </div>
            </div>

            {/* Bottom Large Card */}
            <div className="md:col-span-8 glass-panel rounded-xl p-8 flex flex-col md:flex-row items-center gap-8 group border border-white/10">
              <div className="flex-1 space-y-4">
                <div className="px-3 py-1 rounded-full bg-tertiary-container/20 text-tertiary text-label-md inline-block">
                  Native Integrations
                </div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Connect Everything</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  AWS, Azure, Google Cloud, and private servers—managed through a single, elegant interface. No more tab hopping.
                </p>
                <Link className="text-primary font-label-lg flex items-center gap-1 group-hover:translate-x-2 transition-transform" href="#features">
                  View Integrations <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-4 w-full">
                <div className="aspect-square glass-panel rounded-lg flex items-center justify-center text-on-surface-variant opacity-40 group-hover:opacity-100 transition-all duration-500">
                  <span className="material-symbols-outlined text-[40px]">cloud</span>
                </div>
                <div className="aspect-square glass-panel rounded-lg flex items-center justify-center text-on-surface-variant opacity-40 group-hover:opacity-100 transition-all duration-500">
                  <span className="material-symbols-outlined text-[40px]">database</span>
                </div>
                <div className="aspect-square glass-panel rounded-lg flex items-center justify-center text-on-surface-variant opacity-40 group-hover:opacity-100 transition-all duration-500">
                  <span className="material-symbols-outlined text-[40px]">storage</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-stack-xl px-margin-desktop">
          <div className="max-w-4xl mx-auto glass-panel rounded-3xl p-12 text-center relative overflow-hidden border border-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary" />
            <h2 className="font-display-lg text-display-lg text-on-surface mb-4">Ready to reach the cloud?</h2>
            <p className="font-body-xl text-body-xl text-on-surface-variant mb-stack-lg max-w-xl mx-auto">
              Join 10,000+ data engineers who are already centralizing their infrastructure with CloudFusion.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" prefetch={true} className="bg-primary text-on-primary px-12 py-4 rounded-full font-label-lg text-label-lg shadow-xl shadow-primary/30 hover:brightness-110 active:scale-95 transition-all">
                Start Your Free Trial
              </Link>
              <Link href="/register" prefetch={true} className="text-on-surface-variant hover:text-primary font-label-lg py-4 px-8">
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-stack-xl bg-surface-container-lowest border-t border-outline-variant">
        <div className="max-w-container-max mx-auto px-margin-desktop grid grid-cols-1 md:grid-cols-4 gap-gutter">
          <div className="space-y-4">
            <div className="font-headline-md text-headline-md text-primary">CloudFusion</div>
            <p className="text-on-surface-variant text-body-md pr-4">Future-proof storage for high-performance teams. Built on the edge of innovation.</p>
          </div>
          <div>
            <h4 className="font-label-lg text-label-lg text-on-surface mb-6">Resources</h4>
            <ul className="space-y-4">
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  Documentation
                </Link>
              </li>
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  API
                </Link>
              </li>
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  Status
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-label-lg text-label-lg text-on-surface mb-6">Support</h4>
            <ul className="space-y-4">
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  Support
                </Link>
              </li>
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  Privacy
                </Link>
              </li>
              <li>
                <Link className="text-on-surface-variant hover:text-primary transition-colors text-body-md" href="#features">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-label-lg text-label-lg text-on-surface mb-6">Newsletter</h4>
            <div className="flex gap-2">
              <input
                className="bg-surface-container border border-outline rounded-lg px-4 py-2 w-full focus:ring-1 focus:ring-primary focus:border-primary bg-opacity-20 outline-none text-on-surface"
                placeholder="Email"
                type="email"
              />
              <button className="bg-primary text-on-primary p-2 rounded-lg flex items-center justify-center hover:brightness-110 transition-all">
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
            <p className="mt-8 text-on-surface-variant text-body-md">© 2026 CloudFusion. Future-proof storage.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
