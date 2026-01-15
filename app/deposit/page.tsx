'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { MiniKit } from '@worldcoin/minikit-js';

export default function DepositPage() {
    const [amount, setAmount] = useState('10');
    const [status, setStatus] = useState<'idle' | 'confirming' | 'complete' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const router = useRouter();
    const { worldChainBalance, agent, hasAgent, refreshBalances } = useApp();

    if (!hasAgent || !agent) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold mb-4">No Agent Found</h2>
                    <p className="text-gray-400 mb-6">Create an agent first to deposit funds</p>
                    <Link href="/agent/create" className="btn btn-primary">
                        Create Agent
                    </Link>
                </div>
            </div>
        );
    }

    const handleDeposit = async () => {
        try {
            console.log('[Deposit] 🚀 Starting simple USDC transfer...');
            console.log('[Deposit] Amount:', amount, 'USDC');
            console.log('[Deposit] Agent Address:', agent.address);

            setStatus('confirming');
            setError(null);
            setTxHash(null);

            // Validate amount
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('Invalid amount');
            }

            const balanceNum = parseFloat(worldChainBalance || '0');
            if (amountNum > balanceNum) {
                throw new Error('Insufficient USDC balance');
            }

            console.log('[Deposit] ✅ Starting transaction...');

            // World Chain USDC Contract
            const WORLD_CHAIN_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

            // Convert amount to USDC format (6 decimals)
            const amountInWei = Math.floor(amountNum * 1_000_000).toString();
            console.log('[Deposit] Amount in wei (6 decimals):', amountInWei);

            // Create transaction payload for simple USDC transfer
            const payload = {
                transaction: [{
                    address: WORLD_CHAIN_USDC,
                    abi: [
                        {
                            name: 'transfer',
                            type: 'function',
                            stateMutability: 'nonpayable',
                            inputs: [
                                { name: 'to', type: 'address' },
                                { name: 'value', type: 'uint256' }
                            ],
                            outputs: [{ name: '', type: 'bool' }]
                        }
                    ],
                    functionName: 'transfer',
                    args: [agent.address, amountInWei],
                }],
            };

            console.log('[Deposit] 📝 Transaction Payload:', JSON.stringify(payload, null, 2));
            console.log('[Deposit] 🎯 Requesting MiniKit signature...');

            // Send transaction via MiniKit
            const result = await MiniKit.commandsAsync.sendTransaction(payload as any);

            console.log('[Deposit] 📦 MiniKit response:', result);

            // Check result
            if (!result.finalPayload) {
                throw new Error('Transaction cancelled by user');
            }

            if (result.finalPayload.status === 'error') {
                throw new Error('Transaction failed - please try again');
            }

            const transactionId = (result.finalPayload as any).transaction_id;
            if (!transactionId) {
                throw new Error('No transaction ID received');
            }

            console.log('[Deposit] ✅ Transaction submitted!');
            console.log('[Deposit] 📍 Transaction ID:', transactionId);

            setTxHash(transactionId);
            setStatus('complete');

            // Refresh balances after 3 seconds
            setTimeout(() => {
                console.log('[Deposit] 🔄 Refreshing balances...');
                refreshBalances();
            }, 3000);

        } catch (err: any) {
            console.error('[Deposit] ❌ Error:', err);
            console.error('[Deposit] ❌ Error stack:', err.stack);
            setError(err?.message || 'Deposit failed');
            setStatus('error');
        }
    };

    const handleContinue = () => {
        router.push('/dashboard');
    };

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
                    <h1 className="text-lg font-semibold">Deposit</h1>
                    <div className="w-10" />
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {status === 'idle' || status === 'error' ? (
                    <>
                        <h2 className="text-xl font-semibold mb-2">Deposit USDC</h2>
                        <p className="text-sm text-gray-400 mb-6">Transfer USDC to your trading agent</p>

                        {/* Agent Address */}
                        <div className="card p-4 mb-4">
                            <p className="text-xs text-gray-400 mb-2">Agent Address</p>
                            <p className="text-sm font-mono break-all">{agent.address}</p>
                        </div>

                        {/* Balance Display */}
                        <div className="card p-4 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm text-gray-400">Available on World Chain</span>
                                <span className="text-lg font-semibold">${worldChainBalance || '0'} USDC</span>
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">Network:</span>
                                <div className="badge badge-info">
                                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                        <circle cx="10" cy="10" r="8" />
                                    </svg>
                                    World Chain
                                </div>
                            </div>
                        </div>

                        {/* Amount Input */}
                        <div className="card p-4 mb-6">
                            <label className="text-sm text-gray-400 mb-2 block">Deposit Amount</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="input flex-1 text-xl font-semibold"
                                    placeholder="0"
                                    step="0.01"
                                    min="0"
                                />
                                <span className="text-lg font-semibold">USDC</span>
                            </div>

                            <button
                                onClick={() => setAmount(worldChainBalance || '0')}
                                className="text-sm text-blue-500 mt-2"
                            >
                                Use max
                            </button>
                        </div>

                        {/* Error Display */}
                        {error && (
                            <div className="card p-4 mb-6 border-red-500/50 bg-red-500/10">
                                <p className="text-sm text-red-500">{error}</p>
                            </div>
                        )}

                        {/* Info Box */}
                        <div className="card p-4 mb-6 border-blue-500/50 bg-blue-500/10">
                            <p className="text-xs text-blue-400">
                                💡 This will transfer USDC directly from your World wallet to your agent's address on World Chain.
                            </p>
                        </div>

                        {/* Deposit Button */}
                        <button
                            onClick={handleDeposit}
                            className="btn btn-primary w-full"
                            disabled={!amount || parseFloat(amount) <= 0}
                        >
                            Transfer USDC
                        </button>

                        <p className="text-xs text-gray-400 text-center mt-4">
                            Make sure you have opened this in World App
                        </p>
                    </>
                ) : (
                    /* Status Display */
                    <div className="card p-6">
                        <div className="text-center">
                            <div className="mb-4">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-4">
                                    {status === 'confirming' && (
                                        <div className="animate-spin">
                                            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        </div>
                                    )}
                                    {status === 'complete' && (
                                        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            <h3 className="text-lg font-semibold mb-2">
                                {status === 'confirming' && 'Processing...'}
                                {status === 'complete' && 'Complete!'}
                            </h3>

                            <p className="text-sm text-gray-400 mb-4">
                                {status === 'confirming' && 'Waiting for transaction confirmation'}
                                {status === 'complete' && `${amount} USDC transferred to your agent`}
                            </p>

                            {txHash && (
                                <div className="card p-3 mb-4 bg-[var(--bg-primary)]">
                                    <p className="text-xs text-gray-400 mb-1">Transaction ID:</p>
                                    <p className="text-xs font-mono break-all">{txHash}</p>
                                </div>
                            )}

                            {status === 'complete' && (
                                <button onClick={handleContinue} className="btn btn-primary">
                                    Back to Dashboard
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
