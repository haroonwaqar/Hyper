'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

export default function DashboardPage() {
    const router = useRouter();
    const {
        isAuthenticated,
        isAuthenticating,
        userAddress,
        agent,
        agentLoading,
        hasAgent,
        worldChainBalance,
        hyperliquidBalance,
        refreshBalances,
    } = useApp();

    // Refresh balances on mount
    useEffect(() => {
        if (isAuthenticated) {
            refreshBalances();
            // Refresh every 30 seconds
            const interval = setInterval(refreshBalances, 30000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated]);

    if (isAuthenticating || agentLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
                    <p className="text-gray-400 mb-6">Please open this app in World App to continue</p>
                </div>
            </div>
        );
    }

    const totalValue = hasAgent ?
        (parseFloat(hyperliquidBalance || '0') + parseFloat(worldChainBalance || '0')).toFixed(2)
        : parseFloat(worldChainBalance || '0').toFixed(2);

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border-color)] px-4 py-3">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                        <span className="font-semibold">HyperWorld</span>
                    </div>
                    <button
                        onClick={() => refreshBalances()}
                        className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Portfolio Summary */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Total Balance */}
                <div className="card p-6 mb-6">
                    <div className="text-center mb-4">
                        <p className="text-sm text-gray-400 mb-2">Total Balance</p>
                        <h2 className="text-3xl font-bold">${totalValue}</h2>
                        {hasAgent && agent && (
                            <div className="flex items-center justify-center gap-2 mt-3">
                                <span className={`text-sm font-medium ${parseFloat(agent.usdcBalance) > 0 ? 'text-green-500' : 'text-gray-400'}`}>
                                    Agent: ${agent.usdcBalance}
                                </span>
                                <span className="text-gray-600">·</span>
                                <span className="text-sm text-gray-400">
                                    World: ${worldChainBalance || '0'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Agent Status or Create CTA */}
                    {hasAgent && agent ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                                <div>
                                    <p className="text-sm text-gray-400">Active Strategy</p>
                                    <p className="font-semibold">{agent.config.risk}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="status-dot active"></span>
                                    <span className="text-sm text-green-500">Active</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => router.push('/agent/configure')}
                                    className="btn btn-secondary"
                                >
                                    Edit Strategy
                                </button>
                                <Link href="/deposit" className="btn btn-primary">
                                    Add Funds
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-gray-400 mb-4">No trading agent yet</p>
                            <Link href="/agent/create" className="btn btn-primary">
                                Create Your Agent
                            </Link>
                        </div>
                    )}
                </div>

                {/* Agent Details */}
                {hasAgent && agent && (
                    <div className="card p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 mb-3">Agent Address</h3>
                        <div className="bg-[var(--bg-secondary)] p-3 rounded-lg">
                            <p className="text-xs font-mono break-all">{agent.address}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Send USDC to this address on Hyperliquid to fund your agent
                        </p>
                    </div>
                )}

                {/* Quick Stats */}
                {hasAgent && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="card p-4">
                            <p className="text-xs text-gray-400 mb-1">Leverage</p>
                            <p className="text-lg font-semibold">{agent?.config.leverage}x</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-gray-400 mb-1">Risk Level</p>
                            <p className="text-lg font-semibold">{agent?.config.risk}</p>
                        </div>
                    </div>
                )}

                {/* Wallet Address Info */}
                <div className="mt-6 p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
                    <p className="text-xs text-gray-400 mb-2">Your Wallet</p>
                    <p className="text-sm font-mono">{userAddress}</p>
                </div>
            </div>

            {/* Bottom Navigation */}
            <nav className="bottom-nav">
                <Link href="/dashboard" className="nav-item active">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Home</span>
                </Link>
                <Link href="/agents" className="nav-item">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Agents</span>
                </Link>
                <Link href="/explore" className="nav-item">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Explore</span>
                </Link>
                <Link href="/profile" className="nav-item">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Profile</span>
                </Link>
            </nav>
        </div>
    );
}
