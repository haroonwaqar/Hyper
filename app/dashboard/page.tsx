'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { API_BASE_URL } from '@/lib/api';
import AgentSettings from '../components/AgentSettings';

interface Portfolio {
    accountValue: number;
    totalMarginUsed: number;
    availableBalance: number;
    totalUnrealizedPnl: number;
    totalPositionValue: number;
    positions: any[];
    openOrders: any[];
    lastUpdated: number;
}

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
        arbUsdcBalance,
        refreshBalances,
    } = useApp();

    const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
    const [portfolioLoading, setPortfolioLoading] = useState(false);
    const [priceData, setPriceData] = useState<any[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [togglingAgent, setTogglingAgent] = useState(false);

    // Fetch portfolio data
    useEffect(() => {
        if (isAuthenticated && userAddress) {
            fetchPortfolio();
            fetchPriceHistory();
            // Refresh every 30 seconds
            const interval = setInterval(() => {
                fetchPortfolio();
                fetchPriceHistory();
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, userAddress]);

    async function fetchPortfolio() {
        if (!userAddress) return;

        try {
            setPortfolioLoading(true);
            const response = await fetch(`${API_BASE_URL}/user/portfolio?walletAddress=${userAddress}`);
            const data = await response.json();

            if (data.success && data.hasAgent) {
                setPortfolio(data.portfolio);
            }
        } catch (error) {
            console.error('Failed to fetch portfolio:', error);
        } finally {
            setPortfolioLoading(false);
        }
    }

    async function handleToggleAgent() {
        if (!userAddress) return;
        if (!agent) return;
        setTogglingAgent(true);
        try {
            const endpoint = agent.isActive ? '/agent/stop' : '/agent/start';
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worldWalletAddress: userAddress }),
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to update agent status');
            }
            await refreshBalances();
        } catch (error) {
            console.error('Toggle agent error:', error);
            alert(error instanceof Error ? error.message : 'Failed to update agent status');
        } finally {
            setTogglingAgent(false);
        }
    }

    async function fetchPriceHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/user/price-history?coin=ETH&interval=1h&limit=24`);
            const data = await response.json();

            if (data.success) {
                setPriceData(data.candles);
            }
        } catch (error) {
            console.error('Failed to fetch price history:', error);
        }
    }

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

    // Calculate total value (World Chain + Hyperliquid)
    const totalValue = portfolio
        ? portfolio.accountValue.toFixed(2)
        : (parseFloat(worldChainBalance || '0') + parseFloat(hyperliquidBalance || '0')).toFixed(2);

    const pnl = portfolio?.totalUnrealizedPnl || 0;
    const pnlPercent = portfolio ? (pnl / portfolio.accountValue * 100).toFixed(2) : '0';

    // Simple price mini-chart data
    const latestPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0;
    const priceChange = priceData.length > 1
        ? ((priceData[priceData.length - 1].close - priceData[0].close) / priceData[0].close * 100).toFixed(2)
        : '0';

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
                        onClick={() => {
                            refreshBalances();
                            fetchPortfolio();
                        }}
                        className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    >
                        <svg className={`w-6 h-6 ${portfolioLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Portfolio Summary */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Total Portfolio Value */}
                <div className="card p-6 mb-6">
                    <div className="text-center mb-4">
                        <p className="text-sm text-gray-400 mb-2">Portfolio Value</p>
                        <h2 className="text-4xl font-bold">${totalValue}</h2>
                        {portfolio && (
                            <div className="flex items-center justify-center gap-3 mt-3">
                                <span className={`text-sm font-medium ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPercent}%)
                                </span>
                                <span className="text-gray-600">·</span>
                                <span className="text-sm text-gray-400">
                                    Last 24h
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Mini Price Chart */}
                    {priceData.length > 0 && (
                        <div className="pt-4 border-t border-[var(--border-color)]">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-400">ETH Price</span>
                                <span className={`text-xs font-medium ${parseFloat(priceChange) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%
                                </span>
                            </div>
                            <div className="h-16 flex items-end gap-1">
                                {priceData.map((candle, i) => {
                                    const height = ((candle.close - Math.min(...priceData.map(c => c.low))) /
                                        (Math.max(...priceData.map(c => c.high)) - Math.min(...priceData.map(c => c.low)))) * 100;
                                    return (
                                        <div
                                            key={i}
                                            className="flex-1 bg-blue-500 rounded-t opacity-70 hover:opacity-100 transition-opacity"
                                            style={{ height: `${height}%` }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Agent Status or Create CTA */}
                    {hasAgent && agent ? (
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                                <div>
                                    <p className="text-sm text-gray-400">Agent Status</p>
                                    <p className="font-semibold">{agent.config.risk} Strategy</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Balance: ${parseFloat(hyperliquidBalance || '0').toFixed(2)} · PnL: ${portfolio?.totalUnrealizedPnl?.toFixed(2) ?? '0.00'}
                                    </p>
                                    {arbUsdcBalance && parseFloat(arbUsdcBalance) > 0 && (!hyperliquidBalance || parseFloat(hyperliquidBalance) === 0) && (
                                        <p className="text-xs text-yellow-500 mt-1">
                                            ${parseFloat(arbUsdcBalance).toFixed(2)} USDC on Arbitrum (pending Hyperliquid credit)
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {agent.isActive && <span className="status-dot active"></span>}
                                    <span className={`text-sm ${agent.isActive ? 'text-green-500' : 'text-gray-500'}`}>
                                        {agent.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={() => setShowSettings(true)}
                                    className="btn btn-secondary"
                                >
                                    ⚙️ Configure
                                </button>
                                <button
                                    onClick={handleToggleAgent}
                                    disabled={togglingAgent}
                                    className={`btn ${agent.isActive ? 'btn-secondary' : 'btn-primary'}`}
                                >
                                    {togglingAgent ? 'Updating...' : agent.isActive ? '⏸ Stop' : '▶️ Start'}
                                </button>
                                <Link href="/deposit" className="btn btn-primary">
                                    Add Funds
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 mt-4 border-t border-[var(--border-color)]">
                            <p className="text-gray-400 mb-4">Create an AI trading agent</p>
                            <Link href="/agent/create" className="btn btn-primary">
                                Create Agent
                            </Link>
                        </div>
                    )}
                </div>

                {/* Account Details */}
                {portfolio && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="card p-4">
                            <p className="text-xs text-gray-400 mb-1">Available</p>
                            <p className="text-lg font-semibold">${portfolio.availableBalance.toFixed(2)}</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-gray-400 mb-1">In Use</p>
                            <p className="text-lg font-semibold">${portfolio.totalMarginUsed.toFixed(2)}</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-gray-400 mb-1">Positions</p>
                            <p className="text-lg font-semibold">{portfolio.positions.length}</p>
                        </div>
                    </div>
                )}

                {/* Active Positions */}
                {portfolio && portfolio.positions.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold mb-3">Active Positions</h3>
                        <div className="space-y-2">
                            {portfolio.positions.slice(0, 3).map((pos, i) => (
                                <div key={i} className="card p-3">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{pos.coin}</p>
                                            <p className="text-xs text-gray-400">{pos.side} {pos.size.toFixed(4)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-semibold ${pos.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                ${pos.unrealizedPnl.toFixed(2)}
                                            </p>
                                            <p className="text-xs text-gray-400">${pos.markPrice.toFixed(2)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {portfolio.positions.length > 3 && (
                            <Link href="/agents" className="block text-center text-sm text-blue-500 mt-3">
                                View all {portfolio.positions.length} positions →
                            </Link>
                        )}
                    </div>
                )}

                {/* Agent Address */}
                {hasAgent && agent && (
                    <div className="card p-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2">Agent Address</h3>
                        <div className="bg-[var(--bg-secondary)] p-3 rounded-lg">
                            <p className="text-xs font-mono break-all">{agent.address}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Deposit USDC to this address on Hyperliquid
                        </p>
                    </div>
                )}
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

            {/* Agent Settings Modal */}
            {showSettings && hasAgent && (<AgentSettings onClose={() => setShowSettings(false)} />
            )}
        </div>
    );
}
