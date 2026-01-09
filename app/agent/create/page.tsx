'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/app/context/AppContext';

type StrategyType = 'Steady' | 'Balanced' | 'Aggressive' | 'Custom';

interface StrategyOption {
    id: StrategyType;
    name: string;
    subtitle: string;
    risk: 'Conservative' | 'Moderate' | 'Aggressive';
    leverage: number;
    color: string;
}

const strategies: StrategyOption[] = [
    {
        id: 'Steady',
        name: 'Steady',
        subtitle: 'Low Risk',
        risk: 'Conservative',
        leverage: 1,
        color: 'from-teal-500 to-emerald-500'
    },
    {
        id: 'Balanced',
        name: 'Balanced',
        subtitle: 'Moderate Risk',
        risk: 'Moderate',
        leverage: 2,
        color: 'from-blue-500 to-cyan-500'
    },
    {
        id: 'Aggressive',
        name: 'Aggressive',
        subtitle: 'High Risk',
        risk: 'Aggressive',
        leverage: 3,
        color: 'from-red-500 to-orange-500'
    },
    {
        id: 'Custom',
        name: 'Custom',
        subtitle: 'Build Your Own',
        risk: 'Moderate',
        leverage: 2,
        color: 'from-purple-500 to-pink-500'
    }
];

export default function CreateAgentPage() {
    const [selected, setSelected] = useState<StrategyType>('Balanced');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { createUserAgent, isAuthenticated, hasAgent } = useApp();

    // Redirect if already has agent
    if (hasAgent) {
        router.replace('/dashboard');
        return null;
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
                    <p className="text-gray-400 mb-6">Please open this app in World App</p>
                </div>
            </div>
        );
    }

    const handleCreateAgent = async () => {
        const selectedStrategy = strategies.find(s => s.id === selected);
        if (!selectedStrategy) return;

        try {
            setIsCreating(true);
            setError(null);

            // Create agent with selected strategy
            await createUserAgent(selectedStrategy.risk);

            // Success! Navigate to dashboard
            router.push('/dashboard?created=true');
        } catch (err) {
            console.error('Failed to create agent:', err);
            setError(err instanceof Error ? err.message : 'Failed to create agent');
        } finally {
            setIsCreating(false);
        }
    };

    const selectedStrategy = strategies.find(s => s.id === selected);

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border-color)] px-4 py-3">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <Link href="/dashboard">
                        <button className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    </Link>
                    <h1 className="text-lg font-semibold">Create Agent</h1>
                    <div className="w-10" />
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <h2 className="text-xl font-semibold mb-2">Choose Your Strategy Style</h2>
                <p className="text-sm text-gray-400 mb-6">
                    Select a trading strategy for your AI agent
                </p>

                {/* Strategy Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    {strategies.map((strategy) => (
                        <button
                            key={strategy.id}
                            onClick={() => setSelected(strategy.id)}
                            disabled={isCreating}
                            className={`strategy-card ${selected === strategy.id ? 'selected' : ''} ${isCreating ? 'opacity-50' : ''}`}
                        >
                            <div className={`w-12 h-12 mx-auto mb-3 rounded-lg bg-gradient-to-br ${strategy.color} flex items-center justify-center`}>
                                {strategy.id === 'Steady' && (
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                )}
                                {strategy.id === 'Balanced' && (
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                )}
                                {strategy.id === 'Aggressive' && (
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                )}
                                {strategy.id === 'Custom' && (
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                    </svg>
                                )}
                            </div>
                            <h3 className="font-semibold text-base mb-1">{strategy.name}</h3>
                            <p className="text-xs text-gray-400">{strategy.subtitle}</p>
                        </button>
                    ))}
                </div>

                {/* Selected Strategy Details */}
                {selectedStrategy && (
                    <div className="card p-4 mb-6">
                        <h3 className="text-sm font-semibold mb-3">Strategy Details</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Risk Level:</span>
                                <span className="font-medium">{selectedStrategy.risk}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Leverage:</span>
                                <span className="font-medium">{selectedStrategy.leverage}x</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="card p-4 mb-6 border-red-500/50 bg-red-500/10">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                )}

                {/* Create Agent Button */}
                <button
                    onClick={handleCreateAgent}
                    disabled={isCreating}
                    className="btn btn-primary w-full"
                >
                    {isCreating ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                            <span>Creating Agent...</span>
                        </div>
                    ) : (
                        'Create Agent'
                    )}
                </button>

                {/* Info */}
                <div className="mt-6 p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
                    <p className="text-xs text-gray-400">
                        Your agent will be created with an encrypted wallet on Hyperliquid. You'll receive the agent's deposit address after creation.
                    </p>
                </div>
            </div>
        </div>
    );
}
