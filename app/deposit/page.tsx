'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { MiniKit, ResponseEvent, type MiniAppSendTransactionPayload } from '@worldcoin/minikit-js';

const WORLD_CHAIN_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

export default function DepositPage() {
    const [amount, setAmount] = useState('10');
    const [status, setStatus] = useState<'idle' | 'confirming' | 'complete' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const router = useRouter();
    const { worldChainBalance, agent, hasAgent, refreshBalances } = useApp();
    const didInitRef = useRef(false);
    const [lifiPermit2Proxy, setLifiPermit2Proxy] = useState<string | null>(null);

    // Initialize MiniKit and fetch LI.FI metadata
    useEffect(() => {
        if (didInitRef.current) return;
        didInitRef.current = true;

        console.log('[Deposit] Initializing MiniKit...');
        MiniKit.install(process.env.NEXT_PUBLIC_WLD_APP_ID);
        console.log('[Deposit] MiniKit installed');

        // Fetch LI.FI Permit2Proxy address
        (async () => {
            try {
                const res = await fetch('https://li.quest/v1/chains', {
                    method: 'GET',
                    headers: { Accept: 'application/json' }
                });
                const json = await res.json();
                const chain = json?.chains?.find((c: any) => c?.id === 480); // World Chain
                const proxy = chain?.permit2Proxy;
                if (proxy) {
                    console.log('[Deposit] LI.FI Permit2Proxy:', proxy);
                    setLifiPermit2Proxy(proxy);
                } else {
                    console.error('[Deposit] No Permit2Proxy found for World Chain');
                }
            } catch (e: any) {
                console.error('[Deposit] Failed to fetch LI.FI metadata:', e);
            }
        })();
    }, []);

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

    // Exact pattern from working bridge code
    async function sendTxAndWait(payload: any, timeoutMs = 45000): Promise<MiniAppSendTransactionPayload> {
        console.log('[Deposit] sendTxAndWait called');

        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log('[Deposit] ❌ Timeout');
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                reject(new Error('Transaction timed out. Please try again.'));
            }, timeoutMs);

            console.log('[Deposit] Setting up subscription...');

            MiniKit.subscribe(ResponseEvent.MiniAppSendTransaction, (response) => {
                console.log('[Deposit] ✅ Response received:', response);
                clearTimeout(timer);
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                resolve(response as MiniAppSendTransactionPayload);
            });

            console.log('[Deposit] Calling sendTransaction...');
            const commandPayload = MiniKit.commands.sendTransaction(payload as any);
            console.log('[Deposit] Command result:', commandPayload);

            if (!commandPayload) {
                clearTimeout(timer);
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                reject(new Error('MiniKit sendTransaction unavailable'));
            }
        });
    }

    function randomUint256String(): string {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        let hex = '0x';
        for (const b of bytes) hex += b.toString(16).padStart(2, '0');
        return BigInt(hex).toString(10);
    }

    const handleDeposit = async () => {
        try {
            console.log('[Deposit] ==================== START ====================');
            console.log('[Deposit] Amount:', amount, 'USDC');
            console.log('[Deposit] Agent:', agent.address);
            console.log('[Deposit] Permit2Proxy:', lifiPermit2Proxy);

            setStatus('confirming');
            setError(null);
            setTxHash(null);

            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('Invalid amount');
            }

            const balanceNum = parseFloat(worldChainBalance || '0');
            if (amountNum > balanceNum) {
                throw new Error('Insufficient USDC balance');
            }

            if (!lifiPermit2Proxy) {
                throw new Error('LI.FI Permit2Proxy not loaded. Please refresh and try again.');
            }

            const amountBigInt = BigInt(Math.floor(amountNum * 1_000_000));
            console.log('[Deposit] Amount:', amountBigInt.toString());

            // Use simple USDC transfer on World Chain (same chain, no bridge needed)
            // This uses Permit2 to avoid needing approval transaction
            const nonce = randomUint256String();
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60).toString(10);

            console.log('[Deposit] Building Permit2 transfer payload...');

            const payload = {
                transaction: [{
                    address: lifiPermit2Proxy as `0x${string}`,
                    abi: [
                        {
                            type: 'function',
                            name: 'transferWithPermit2',
                            inputs: [
                                { name: 'token', type: 'address' },
                                { name: 'to', type: 'address' },
                                { name: 'amount', type: 'uint256' },
                                { name: 'nonce', type: 'uint256' },
                                { name: 'deadline', type: 'uint256' }
                            ],
                            outputs: [],
                            stateMutability: 'nonpayable'
                        }
                    ],
                    functionName: 'transferWithPermit2',
                    args: [
                        WORLD_CHAIN_USDC,
                        agent.address,
                        amountBigInt.toString(),
                        nonce,
                        deadline
                    ],
                }],
                permit2: [{
                    permitted: {
                        token: WORLD_CHAIN_USDC,
                        amount: amountBigInt.toString(),
                    },
                    spender: lifiPermit2Proxy,
                    nonce,
                    deadline,
                }],
            };

            console.log('[Deposit] Payload:', JSON.stringify(payload, null, 2));

            const result = await sendTxAndWait(payload);

            console.log('[Deposit] Result:', result);

            if (result.status === 'success') {
                const transactionId = result.transaction_id;
                console.log('[Deposit] ✅ Success! TX:', transactionId);

                setTxHash(transactionId);
                setStatus('complete');

                setTimeout(() => {
                    console.log('[Deposit] Refreshing balances...');
                    refreshBalances();
                }, 3000);
            } else {
                throw new Error('Transaction failed');
            }

            console.log('[Deposit] ==================== SUCCESS ====================');

        } catch (err: any) {
            console.error('[Deposit] ==================== ERROR ====================');
            console.error('[Deposit] Error:', err);
            setError(err?.message || 'Deposit failed');
            setStatus('error');
        }
    };

    const handleContinue = () => {
        router.push('/dashboard');
    };

    return (
        <div className="min-h-screen pb-24">
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

            <div className="max-w-2xl mx-auto px-4 py-6">
                {status === 'idle' || status === 'error' ? (
                    <>
                        <h2 className="text-xl font-semibold mb-2">Deposit USDC</h2>
                        <p className="text-sm text-gray-400 mb-6">Transfer USDC to your trading agent</p>

                        <div className="card p-4 mb-4">
                            <p className="text-xs text-gray-400 mb-2">Agent Address</p>
                            <p className="text-sm font-mono break-all">{agent.address}</p>
                        </div>

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

                        {error && (
                            <div className="card p-4 mb-6 border-red-500/50 bg-red-500/10">
                                <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>
                            </div>
                        )}

                        {!lifiPermit2Proxy && (
                            <div className="card p-4 mb-6 border-yellow-500/50 bg-yellow-500/10">
                                <p className="text-xs text-yellow-600">Loading LI.FI metadata...</p>
                            </div>
                        )}

                        <button
                            onClick={handleDeposit}
                            className="btn btn-primary w-full"
                            disabled={!amount || parseFloat(amount) <= 0 || !lifiPermit2Proxy}
                        >
                            Transfer USDC
                        </button>

                        <p className="text-xs text-gray-400 text-center mt-4">
                            Open browser console (F12) to see detailed logs
                        </p>
                    </>
                ) : (
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
