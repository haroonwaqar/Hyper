'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { MiniKit, type MiniAppSendTransactionPayload } from '@worldcoin/minikit-js';

export default function DepositPage() {
    const [amount, setAmount] = useState('10');
    const [status, setStatus] = useState<'idle' | 'confirming' | 'complete' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
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
            console.log('[Deposit] 🚀 Starting deposit flow...');
            setStatus('confirming');
            setError(null);

            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('Invalid amount');
            }

            const balanceNum = parseFloat(worldChainBalance || '0');
            if (amountNum > balanceNum) {
                throw new Error('Insufficient USDC balance');
            }

            console.log(`[Deposit] 💰 Amount: $${amountNum} USDC`);
            console.log(`[Deposit] 🏦 Sending to agent: ${agent.address}`);

            // Contract addresses
            const WORLD_CHAIN_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
            const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
            const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

            const amountInWei = BigInt(Math.floor(amountNum * 1_000_000)); // USDC has 6 decimals

            console.log('[Deposit] 📊 Getting bridge routes...');

            // Get routes from LI.FI (using routes endpoint which is more reliable)
            const routesRequest = {
                fromChainId: 480, // World Chain
                toChainId: 42161, // Arbitrum
                fromTokenAddress: WORLD_CHAIN_USDC,
                toTokenAddress: ARBITRUM_USDC,
                fromAmount: amountInWei.toString(),
                fromAddress: agent.address,
                toAddress: agent.address,
                options: {
                    slippage: 0.03,  // 3%
                    order: 'CHEAPEST',
                },
            };

            console.log('[Deposit] Routes request:', JSON.stringify(routesRequest, null, 2));

            const routesResponse = await fetch('https://li.quest/v1/advanced/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(routesRequest),
            });

            console.log('[Deposit] Routes response status:', routesResponse.status);

            const routesText = await routesResponse.text();
            console.log('[Deposit] Routes response:', routesText.substring(0, 500));

            if (!routesResponse.ok) {
                throw new Error(`Failed to get bridge routes: ${routesResponse.status} - ${routesText}`);
            }

            const routesData = JSON.parse(routesText);

            if (!routesData.routes || routesData.routes.length === 0) {
                throw new Error('No bridge routes available for World Chain → Arbitrum');
            }

            // Get the best route (first one)
            const route = routesData.routes[0];
            console.log('[Deposit] ✅ Route found:', route.steps[0].tool);

            // Extract transaction request from the first step
            const quote = route.steps[0];

            // Approve USDC spending for LI.FI Diamond contract
            console.log('[Deposit] 📝 Requesting approval signature...');

            const approvePayload = {
                transaction: [{
                    address: WORLD_CHAIN_USDC,
                    abi: [
                        {
                            name: 'approve',
                            type: 'function',
                            stateMutability: 'nonpayable',
                            inputs: [
                                { name: 'spender', type: 'address' },
                                { name: 'amount', type: 'uint256' }
                            ],
                            outputs: [{ name: '', type: 'bool' }]
                        }
                    ],
                    functionName: 'approve',
                    args: [LIFI_DIAMOND, amountInWei.toString()],
                }],
            };

            const approvalResult = await MiniKit.commandsAsync.sendTransaction(approvePayload);

            if (!approvalResult.finalPayload) {
                throw new Error('Transaction cancelled by user');
            }

            if (approvalResult.finalPayload.status === 'error') {
                throw new Error('Approval transaction failed');
            }

            const approvalTxId = approvalResult.finalPayload.transaction_id;
            if (!approvalTxId) {
                throw new Error('No approval transaction ID received');
            }

            console.log('[Deposit] ✅ Approval tx:', approvalTxId);

            // Wait for approval confirmation
            console.log('[Deposit] ⏳ Waiting for approval...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Execute bridge transaction using LI.FI
            console.log('[Deposit] 🌉 Requesting bridge transaction...');

            const bridgePayload = {
                transaction: quote.transactionRequest ? [{
                    address: quote.transactionRequest.to,
                    abi: [],
                    value: quote.transactionRequest.value || '0',
                    calldata: quote.transactionRequest.data,
                }] : [],
            };

            const bridgeResult = await MiniKit.commandsAsync.sendTransaction(bridgePayload as any);

            if (!bridgeResult.finalPayload) {
                throw new Error('Bridge transaction cancelled by user');
            }

            if (bridgeResult.finalPayload.status === 'error') {
                throw new Error('Bridge transaction failed');
            }

            const bridgeTxId = bridgeResult.finalPayload.transaction_id;
            if (!bridgeTxId) {
                throw new Error('No bridge transaction ID received');
            }

            console.log('[Deposit] ✅ Bridge tx:', bridgeTxId);
            console.log('[Deposit] 🎉 Transaction confirmed!');

            setStatus('complete');

            // Refresh balances
            setTimeout(() => {
                console.log('[Deposit] 🔄 Refreshing balances...');
                refreshBalances();
            }, 2000);

        } catch (err) {
            console.error('[Deposit] ❌ Error:', err);
            setError(err instanceof Error ? err.message : 'Deposit failed');
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
                        <h2 className="text-xl font-semibold mb-2">Deposit to Hyperliquid</h2>
                        <p className="text-sm text-gray-400 mb-6">Transfer funds to start your agent</p>

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

                        {/* Deposit Button */}
                        <button
                            onClick={handleDeposit}
                            className="btn btn-primary w-full"
                            disabled={!amount || parseFloat(amount) <= 0}
                        >
                            Deposit with World
                        </button>

                        <p className="text-xs text-gray-400 text-center mt-4">
                            Funds will be bridged from World Chain to your agent on Hyperliquid
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

                            <p className="text-sm text-gray-400 mb-6">
                                {status === 'confirming' && 'Your deposit is being processed'}
                                {status === 'complete' && `${amount} USDC sent to your agent`}
                            </p>

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
