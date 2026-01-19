'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { MiniKit, ResponseEvent, type MiniAppSendTransactionPayload } from '@worldcoin/minikit-js';
import { parseAbi } from 'viem';
import { LIFI_DIAMOND_CONTRACT, WORLDCHAIN_USDC, WORLD_CHAIN_ID } from '@/lib/constants';
import { getFunctionSelector, parseUsdcToBaseUnits } from '@/lib/usdc';

export default function DepositPage() {
    const [amount, setAmount] = useState('10');
    const [status, setStatus] = useState<'idle' | 'confirming' | 'complete' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [entrypointSelector, setEntrypointSelector] = useState<string | null>(null);
    const [routerAddress, setRouterAddress] = useState<string | null>(null);
    const [lifiPermit2Proxy, setLifiPermit2Proxy] = useState<`0x${string}` | null>(null);
    const [lifiPermit2ProxyError, setLifiPermit2ProxyError] = useState<string | null>(null);
    const router = useRouter();
    const { worldChainBalance, agent, hasAgent, refreshBalances, userAddress } = useApp();
    const didInitRef = useRef(false);

    const LIFI_PERMIT2_PROXY_ABI = parseAbi([
        'function callDiamondWithPermit2(bytes transactionData, ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) external',
    ]);

    function isLikelyEvmAddress(addr: string): addr is `0x${string}` {
        return /^0x[a-fA-F0-9]{40}$/.test(addr);
    }

    function randomUint256String(): string {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        let hex = '0x';
        for (const b of bytes) hex += b.toString(16).padStart(2, '0');
        return BigInt(hex).toString(10);
    }

    // Initialize MiniKit on mount
    useEffect(() => {
        if (didInitRef.current) return;
        didInitRef.current = true;

        console.log('[Deposit] Initializing MiniKit...');
        MiniKit.install(process.env.NEXT_PUBLIC_WLD_APP_ID);
        console.log('[Deposit] MiniKit installed');
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLifiPermit2ProxyError(null);
                const res = await fetch('https://li.quest/v1/chains', {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                });
                const json = await res.json();
                const chain = json?.chains?.find((c: any) => c?.id === WORLD_CHAIN_ID);
                const proxy = chain?.permit2Proxy;
                if (proxy && isLikelyEvmAddress(proxy)) {
                    if (!cancelled) setLifiPermit2Proxy(proxy);
                    return;
                }
                throw new Error('LI.FI did not return permit2Proxy for World Chain');
            } catch (e: any) {
                if (!cancelled) setLifiPermit2ProxyError(e?.message ?? 'Failed to load LI.FI chain metadata');
            }
        })();
        return () => {
            cancelled = true;
        };
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

    async function sendTxAndWait(payload: any, timeoutMs = 120000): Promise<MiniAppSendTransactionPayload> {
        console.log('[Deposit] sendTxAndWait called');

        if (!MiniKit.isInstalled()) {
            throw new Error('Please open this app in World App');
        }

        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log('[Deposit] ❌ Timeout');
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                reject(
                    new Error(
                        'Timed out waiting for World App. If no confirmation sheet appeared, ensure sendTransaction is enabled and the contract entrypoints are allowlisted.'
                    )
                );
            }, timeoutMs);

            MiniKit.subscribe(ResponseEvent.MiniAppSendTransaction, (finalPayload) => {
                clearTimeout(timer);
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                resolve(finalPayload as MiniAppSendTransactionPayload);
            });

            const commandPayload = MiniKit.commands.sendTransaction(payload as any);
            if (!commandPayload) {
                clearTimeout(timer);
                MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
                reject(
                    new Error(
                        'sendTransaction is unavailable in this World App session. Update World App and ensure contract entrypoints are allowlisted.'
                    )
                );
            }
        });
    }

    function normalizeHexValue(value: string | undefined, fieldLabel: string) {
        if (!value) return undefined;
        if (value.startsWith('0x')) return value;
        try {
            return `0x${BigInt(value).toString(16)}`;
        } catch {
            throw new Error(`Invalid ${fieldLabel} value from quote`);
        }
    }

    const handleDeposit = async () => {
        try {
            console.log('[Deposit] ==================== START ====================');
            console.log('[Deposit] Amount:', amount, 'USDC');
            console.log('[Deposit] Agent:', agent.address);

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

            if (!userAddress) {
                throw new Error('Wallet not connected');
            }

            // Fetch bridge quote from LI.FI (World Chain -> Arbitrum USDC)
            const quoteRes = await fetch('/api/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountUsdc: amount,
                    fromAddress: userAddress,
                    toAddress: agent.address,
                }),
            });

            const quoteJson = await quoteRes.json();
            if (!quoteRes.ok) {
                throw new Error(quoteJson?.message || 'Failed to fetch bridge quote');
            }

            const transactionRequest = quoteJson?.transactionRequest;
            if (!transactionRequest?.to || !transactionRequest?.data) {
                throw new Error('Bridge quote missing transaction request');
            }

            const selector = getFunctionSelector(transactionRequest.data);
            setEntrypointSelector(selector);
            setRouterAddress(transactionRequest.to);

            const amountBaseUnits = BigInt(parseUsdcToBaseUnits(amount));
            if (amountBaseUnits <= 0n) {
                throw new Error('Invalid amount');
            }
            const amountBaseUnitsStr = amountBaseUnits.toString(10);
            if (!lifiPermit2Proxy) {
                throw new Error(
                    `Permit2 proxy not available. ${lifiPermit2ProxyError ?? 'Ensure LI.FI supports Permit2 on World Chain.'}`
                );
            }

            const nonce = randomUint256String();
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60).toString(10);

            const payload: any = {
                transaction: [
                    {
                        address: lifiPermit2Proxy,
                        abi: LIFI_PERMIT2_PROXY_ABI,
                        functionName: 'callDiamondWithPermit2',
                        args: [
                            transactionRequest.data,
                            [[WORLDCHAIN_USDC, amountBaseUnitsStr], nonce, deadline],
                            'PERMIT2_SIGNATURE_PLACEHOLDER_0',
                        ],
                        value: transactionRequest.value ?? '0x0',
                    },
                ],
                permit2: [
                    {
                        permitted: {
                            token: WORLDCHAIN_USDC,
                            amount: amountBaseUnitsStr,
                        },
                        spender: lifiPermit2Proxy,
                        nonce,
                        deadline,
                    },
                ],
            };

            console.log(
                '[Deposit] Payload:',
                JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString(10) : v), 2)
            );

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

                // Poll balances for a short period to catch bridge finality.
                (async () => {
                    for (let i = 0; i < 12; i += 1) {
                        await new Promise((resolve) => setTimeout(resolve, 10000));
                        try {
                            await refreshBalances();
                        } catch (e) {
                            console.warn('[Deposit] Balance refresh failed:', e);
                        }
                    }
                })();
            } else {
                const errorCode = (result as any).error_code || 'Transaction failed';
                const details = (result as any).details;
                throw new Error(details ? `${errorCode}: ${details}` : errorCode);
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
                        <p className="text-sm text-gray-400 mb-6">Bridge USDC to your trading agent on Hyperliquid</p>

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

                        <div className="card p-4 mb-6 border-yellow-500/50 bg-yellow-500/10">
                            <p className="text-xs text-yellow-600 font-semibold mb-2">⚠️ Developer Portal Setup Required</p>
                            <p className="text-xs text-yellow-600 mb-2">
                                Use one address per line (no commas):
                            </p>
                            <p className="text-[11px] text-yellow-700 mb-1">Whitelisted Payment Addresses</p>
                            <code className="block bg-black/20 p-2 rounded text-xs font-mono whitespace-pre-wrap break-all mb-2">
                                {`${routerAddress || LIFI_DIAMOND_CONTRACT}\n${WORLDCHAIN_USDC}`}
                            </code>
                            <p className="text-[11px] text-yellow-700 mb-1">Permit2 Tokens</p>
                            <code className="block bg-black/20 p-2 rounded text-xs font-mono whitespace-pre-wrap break-all mb-2">
                                {WORLDCHAIN_USDC}
                            </code>
                            <p className="text-[11px] text-yellow-700 mb-1">Contract Entrypoints</p>
                            <code className="block bg-black/20 p-2 rounded text-xs font-mono whitespace-pre-wrap break-all">
                                {lifiPermit2Proxy || 'Loading...'}
                            </code>
                            <p className="text-[11px] text-yellow-700 mt-2">
                                Selector from quote: {entrypointSelector || '0x...'}
                            </p>
                        </div>

                        <button
                            onClick={handleDeposit}
                            className="btn btn-primary w-full"
                            disabled={!amount || parseFloat(amount) <= 0}
                        >
                            Transfer USDC
                        </button>

                        <p className="text-xs text-gray-400 text-center mt-4">
                            Open console for detailed logs
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
                                {status === 'confirming' && 'Waiting for confirmation'}
                                {status === 'complete' && `${amount} USDC transferred!`}
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
