'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from './context/AppContext';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isAuthenticating } = useApp();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6">
      {/* Logo and Header */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-md w-full">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gradient">HyperWorld</h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-2xl font-semibold leading-tight">
            Bridge your funds from<br />
            <span className="text-blue-500">World</span> to <span className="text-blue-500">Hyperliquid</span>
          </h2>

          <p className="text-gray-400 text-base leading-relaxed px-4">
            Deploy advanced trading agents<br />
            with ease.
          </p>
        </div>

        {/* Info Card */}
        <div className="card w-full p-5 mb-8">
          <p className="text-sm text-gray-400 leading-relaxed">
            Trading involves risk. Only invest what you can afford to lose.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="btn btn-primary w-full"
          >
            Get Started
          </button>
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary w-full text-center"
          >
            Learn More
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-500">
          Powered by Hyperliquid × World Chain
        </p>
      </div>
    </div>
  );
}
