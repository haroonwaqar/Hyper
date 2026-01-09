'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../context/AppContext';

interface Position {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
}

interface Trade {
    time: number;
    coin: string;
    px: string;
    sz: string;
    side: string;
    fee: string;
    hash: string;
}

export default function AgentsPage() {
    const { agent, hasAgent, hyperliquidBalance, agentLoading } = useApp();
    const [positions, setPositions] = useState<Position[]>([]);
    const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (hasAgent && agent) {
            fetchLiveData();
            // Refresh every 10 seconds
            const interval = setInterval(fetchLiveData, 10000);
            return () => clearInterval(interval);
        }
    }, [hasAgent, agent]);

    async function fetchLiveData() {
        if (!agent) return;

        try {
            setLoading(true);
            setError(null);

            // Fetch positions and trades from Hyperliquid
            const API_URL = 'https://api.hyperliquid.xyz/info';

            console.log('[Agents] Fetching positions for:', agent.address);

            // Get positions
            const positionsRes = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'clearinghouseState',
                    user: agent.address,
                }),
            });

            if (!positionsRes.ok) {
                throw new Error('Failed to fetch positions');
            }

            const positionsData = await positionsRes.json();
            console.log('[Agents] Positions data:', positionsData);

            if (positionsData?.assetPositions) {
                const activePositions = positionsData.assetPositions.filter(
                    (p: any) => parseFloat(p.position.szi) !== 0
                );
                setPositions(activePositions.map((p: any) => ({
                    coin: p.position.coin,
                    szi: p.position.szi,
                    entryPx: p.position.entryPx,
                    positionValue: p.position.positionValue,
                    unrealizedPnl: p.position.unrealizedPnl,
                    returnOnEquity: p.position.returnOnEquity,
                })));
            } else {
                setPositions([]);
            }

            // Get recent fills (trades)
            const tradesRes = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'userFills',
                    user: agent.address,
                }),
            });

            if (!tradesRes.ok) {
                throw new Error('Failed to fetch trades');
            }

            const tradesData = await tradesRes.json();
            console.log('[Agents] Trades data:', tradesData);

            if (Array.isArray(tradesData)) {
                setRecentTrades(tradesData.slice(0, 10).map((t: any) => ({
                    time: t.time,
                    coin: t.coin,
                    px: t.px,
                    sz: t.sz,
                    side: t.side,
                    fee: t.fee,
                    hash: t.hash || '',
                })));
            } else {
                setRecentTrades([]);
            }

        } catch (error) {
            console.error('[Agents] Failed to fetch live data:', error);
            setError(error instanceof Error ? error.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }

    if (agentLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading agent...</p>
                </div>
            </div>
        );
    }

    if (!hasAgent || !agent) {
        return (
            <div className="min-h-screen pb-20">
                <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                    <h2 className="text-xl font-semibold mb-4">No Agent Yet</h2>
                    <p className="text-gray-400 mb-6">Create an agent to start trading</p>
                    <Link href="/agent/create" className="btn btn-primary">
                        Create Agent
                    </Link>
                </div>

                {/* Bottom Navigation */}
                <nav className="bottom-nav">
                    <Link href="/dashboard" className="nav-item">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span>Home</span>
                    </Link>
                    <Link href="/agents" className="nav-item active">
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

    const totalPnl = positions.reduce((acc, p) => acc + parseFloat(p.unrealizedPnl || '0'), 0);
    const activeStatus = agent?.isActive ? 'Active' : 'Inactive';

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border-color)] px-4 py-3">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <h1 className="text-lg font-semibold">Agent Dashboard</h1>
                    <button
                        onClick={fetchLiveData}
                        className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                        disabled={loading}
                    >
                        <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Error Message */}
                {error && (
                    <div className="card p-4 mb-4 border-red-500/50 bg-red-500/10">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                )}

                {/* Strategy Card */}
                <div className="card p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm text-gray-400">Active Strategy</h3>
                            <p className="text-lg font-semibold">{agent.config.risk}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`status-dot ${agent.isActive ? 'active' : ''}`}></span>
                            <span className={`text-sm ${agent.isActive ? 'text-green-500' : 'text-gray-500'}`}>{activeStatus}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--border-color)]">
                        <div>
                            <p className="text-xs text-gray-400">Balance</p>
                            <p className="text-sm font-semibold">${hyperliquidBalance || '0'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">PnL</p>
                            <p className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                ${totalPnl.toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Leverage</p>
                            <p className="text-sm font-semibold">{agent.config.leverage}x</p>
                        </div>
                    </div>
                </div>

                {/* Current Positions */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3">Current Positions</h2>
                    {positions.length > 0 ? (
                        <div className="space-y-2">
                            {positions.map((pos, idx) => (
                                <div key={idx} className="card p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold">{pos.coin}</p>
                                            <p className="text-xs text-gray-400">
                                                {parseFloat(pos.szi) > 0 ? 'Long' : 'Short'} {Math.abs(parseFloat(pos.szi))}  @ ${parseFloat(pos.entryPx).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-semibold ${parseFloat(pos.unrealizedPnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                ${parseFloat(pos.unrealizedPnl).toFixed(2)}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {(parseFloat(pos.returnOnEquity) * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="card p-6 text-center">
                            <p className="text-gray-400">No open positions</p>
                            <p className="text-xs text-gray-500 mt-2">Your agent hasn't made any trades yet</p>
                        </div>
                    )}
                </div>

                {/* Recent Trades */}
                <div>
                    <h2 className="text-lg font-semibold mb-3">Recent Trades</h2>
                    {recentTrades.length > 0 ? (
                        <div className="space-y-2">
                            {recentTrades.map((trade, idx) => (
                                <div key={idx} className="card p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm">{trade.coin}</p>
                                            <p className="text-xs text-gray-400">
                                                {new Date(trade.time).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="text-center flex-1">
                                            <p className={`text-sm font-medium ${trade.side === 'A' ? 'text-green-500' : 'text-red-500'}`}>
                                                {trade.side === 'A' ? 'Buy' : 'Sell'}
                                            </p>
                                            <p className="text-xs text-gray-400">{trade.sz} @ ${parseFloat(trade.px).toFixed(2)}</p>
                                        </div>
                                        <div className="text-right flex-1">
                                            <p className="text-xs text-gray-400">Fee: ${parseFloat(trade.fee).toFixed(4)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="card p-6 text-center">
                            <p className="text-gray-400">No trades yet</p>
                            <p className="text-xs text-gray-500 mt-2">Trade history will appear here once your agent starts trading</p>
                        </div>
                    )}
                </div>

                {/* Agent Info */}
                <div className="mt-6 p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
                    <p className="text-xs text-gray-400 mb-2">Agent Address</p>
                    <p className="text-xs font-mono break-all">{agent.address}</p>
                </div>
            </div>

            {/* Bottom Navigation */}
            <nav className="bottom-nav">
                <Link href="/dashboard" className="nav-item">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Home</span>
                </Link>
                <Link href="/agents" className="nav-item active">
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
