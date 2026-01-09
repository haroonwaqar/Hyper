'use client';

import Link from 'next/link';

interface AgentCard {
    id: string;
    name: string;
    performance: string;
    trend: 'up' | 'down';
    risk: string;
}

const topAgents: AgentCard[] = [
    { id: '1', name: 'Alpha Bot', performance: '+5.3%', trend: 'up', risk: 'High' },
    { id: '2', name: 'SafeGrow', performance: '+1.5%', trend: 'up', risk: 'High' },
];

const easyPicks: AgentCard[] = [
    { id: '3', name: 'Steady Pulse', performance: 'Low avg PnL', trend: 'up', risk: 'Low' },
    { id: '4', name: 'Momentum Max', performance: 'High Risk', trend: 'up', risk: 'High' },
];

export default function ExplorePage() {
    return (
        <div className="min-h-screen pb-20">
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
                    <h1 className="text-lg font-semibold">Explore</h1>
                    <div className="w-10" />
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Top Performing Agents */}
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Top Performing Agents</h2>
                    <div className="space-y-3">
                        {topAgents.map((agent) => (
                            <div key={agent.id} className="card p-4 hover:border-blue-500 cursor-pointer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">{agent.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm text-green-500 font-medium">{agent.performance}</span>
                                                <span className="text-xs text-gray-500">· {agent.risk} risk</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="chart-container w-16 h-8">
                                            <svg viewBox="0 0 60 30" className="w-full h-full">
                                                <polyline
                                                    fill="none"
                                                    stroke="rgb(34 197 94)"
                                                    strokeWidth="2"
                                                    points="0,20 15,15 30,12 45,8 60,5"
                                                />
                                            </svg>
                                        </div>
                                        <button className="btn btn-primary px-4 py-2 text-sm">
                                            View
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Easy Start Picks */}
                <div>
                    <h2 className="text-xl font-semibold mb-4">Easy Start Picks</h2>
                    <div className="space-y-3">
                        {easyPicks.map((agent) => (
                            <div key={agent.id} className="card p-4 hover:border-blue-500 cursor-pointer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 ${agent.risk === 'High' ? 'bg-orange-500/20' : 'bg-green-500/20'} rounded-lg flex items-center justify-center`}>
                                            <svg className={`w-5 h-5 ${agent.risk === 'High' ? 'text-orange-500' : 'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">{agent.name}</h3>
                                            <p className="text-xs text-gray-400 mt-1">{agent.performance}</p>
                                        </div>
                                    </div>
                                    <button className="btn btn-primary px-4 py-2 text-sm">
                                        {agent.risk === 'High' ? 'Copy' : 'View'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
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
                <Link href="/agents" className="nav-item">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Agents</span>
                </Link>
                <Link href="/explore" className="nav-item active">
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
