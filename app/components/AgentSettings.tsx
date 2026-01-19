'use client';

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from 'next/navigation';

interface AgentSettingsProps {
    onClose: () => void;
}

export default function AgentSettings({ onClose }: AgentSettingsProps) {
    const { agent, userAddress, refreshAgent } = useApp();
    const router = useRouter();
    const [stopping, setStopping] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState(agent?.config.risk || 'Conservative');

    if (!agent) {
        return null;
    }

    const strategies = [
        {
            id: 'Conservative',
            name: 'Safe',
            leverage: 1,
            description: 'Funding rate arbitrage - Low risk, steady returns',
            icon: '🛡️',
        },
        {
            id: 'Aggressive',
            name: 'Aggressive',
            leverage: 3,
            description: 'Momentum trading - Higher risk, higher potential returns',
            icon: '⚡',
        },
    ];

    async function handleStopAgent() {
        if (!confirm('Stop agent and close all positions?')) return;

        setStopping(true);
        try {
            const apiUrl =
                process.env.NEXT_PUBLIC_API_URL ||
                (process.env.NODE_ENV === 'production'
                    ? 'https://hyper-production-72e8.up.railway.app'
                    : 'http://localhost:3001');
            const response = await fetch(`${apiUrl}/agent/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worldWalletAddress: userAddress }),
            });

            const data = await response.json();

            if (data.success) {
                await refreshAgent();
                alert(`Agent stopped! Closed ${data.positionsClosed} positions.`);
                onClose();
            } else {
                throw new Error(data.error || 'Failed to stop agent');
            }
        } catch (error) {
            console.error('Stop agent error:', error);
            alert(error instanceof Error ? error.message : 'Failed to stop agent');
        } finally {
            setStopping(false);
        }
    }

    async function handleSwitchStrategy() {
        if (!agent) return;

        if (selectedStrategy === agent.config.risk) {
            alert('Already using this strategy');
            return;
        }

        if (!confirm(`Switch to ${selectedStrategy} strategy?`)) return;

        setSwitching(true);
        try {
            const strategyConfig = {
                risk: selectedStrategy,
                leverage: selectedStrategy === 'Aggressive' ? 3 : 1,
            };

            const apiUrl =
                process.env.NEXT_PUBLIC_API_URL ||
                (process.env.NODE_ENV === 'production'
                    ? 'https://hyper-production-72e8.up.railway.app'
                    : 'http://localhost:3001');
            const response = await fetch(`${apiUrl}/agent/strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    worldWalletAddress: userAddress,
                    strategyConfig,
                }),
            });

            const data = await response.json();

            if (data.success) {
                await refreshAgent();
                alert(`Strategy updated to ${selectedStrategy}!`);
                onClose();
            } else {
                throw new Error(data.error || 'Failed to update strategy');
            }
        } catch (error) {
            console.error('Switch strategy error:', error);
            alert(error instanceof Error ? error.message : 'Failed to switch strategy');
        } finally {
            setSwitching(false);
        }
    }

    async function handleWithdraw() {
        alert('Withdrawal feature coming soon! For now, you can withdraw directly from Hyperliquid.xyz');
        // TODO: Implement withdrawal flow
    }

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--border-color)] p-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Agent Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-4 space-y-6">
                    {/* Current Status */}
                    <div className="card p-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-3">Current Status</h3>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-lg font-semibold">{agent.config.risk} Strategy</p>
                                <p className="text-sm text-gray-400">{agent.config.leverage}x Leverage</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {agent.isActive && <span className="status-dot active"></span>}
                                <span className={`text-sm ${agent.isActive ? 'text-green-500' : 'text-gray-500'}`}>
                                    {agent.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Strategy Selector */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-3">Change Strategy</h3>
                        <div className="space-y-2">
                            {strategies.map((strat) => (
                                <button
                                    key={strat.id}
                                    onClick={() => setSelectedStrategy(strat.id as any)}
                                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${selectedStrategy === strat.id
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-[var(--border-color)] hover:border-gray-600'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="text-3xl">{strat.icon}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-semibold">{strat.name}</p>
                                                <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-gray-400">
                                                    {strat.leverage}x
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-400">{strat.description}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {selectedStrategy !== agent.config.risk && (
                            <button
                                onClick={handleSwitchStrategy}
                                disabled={switching}
                                className="btn btn-primary w-full mt-3"
                            >
                                {switching ? 'Switching...' : `Switch to ${selectedStrategy}`}
                            </button>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-4 border-t border-[var(--border-color)]">
                        <button
                            onClick={handleWithdraw}
                            className="btn btn-secondary w-full"
                        >
                            💰 Withdraw Funds
                        </button>

                        {agent.isActive && (
                            <button
                                onClick={handleStopAgent}
                                disabled={stopping}
                                className="w-full py-3 px-4 rounded-lg bg-red-500/10 border-2 border-red-500 text-red-500 font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                                {stopping ? 'Stopping...' : '🛑 Stop Agent & Close Positions'}
                            </button>
                        )}
                    </div>

                    {/* Info */}
                    <div className="p-4 bg-[var(--bg-secondary)] rounded-lg">
                        <p className="text-xs text-gray-400">
                            <strong>Note:</strong> Changing strategy will close all existing positions and restart trading with the new parameters.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
