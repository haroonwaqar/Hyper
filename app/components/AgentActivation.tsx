// Sample Agent Activation Component
// This demonstrates the complete flow for creating and authorizing an agent

'use client';

import { useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { createAgent, updateStrategy, authorizeAgent, pollAgentStatus } from '@/lib/api';
import { formatForMiniKit } from '@/lib/hyperliquid';

type ActivationStep = 'idle' | 'creating' | 'configuring' | 'signing' | 'authorizing' | 'complete' | 'error';

interface AgentActivationProps {
    worldWalletAddress: string;
    onComplete?: (agentAddress: string) => void;
}

export function AgentActivation({ worldWalletAddress, onComplete }: AgentActivationProps) {
    const [step, setStep] = useState<ActivationStep>('idle');
    const [agentAddress, setAgentAddress] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [selectedStrategy, setSelectedStrategy] = useState<'Conservative' | 'Moderate' | 'Aggressive'>('Conservative');
    const [leverage, setLeverage] = useState<number>(1);

    const handleActivateAgent = async () => {
        try {
            // Step 1: Create Agent
            setStep('creating');
            setError('');

            const { address, isNew } = await createAgent(worldWalletAddress);
            setAgentAddress(address);

            console.log(`Agent ${isNew ? 'created' : 'retrieved'}: ${address}`);

            // Step 2: Configure Strategy
            setStep('configuring');

            await updateStrategy(worldWalletAddress, {
                risk: selectedStrategy,
                leverage,
            });

            console.log('Strategy configured:', { risk: selectedStrategy, leverage });

            // Step 3: Build EIP-712 Payload and Sign
            setStep('signing');

            const payload = formatForMiniKit(address, 42161); // Arbitrum One

            // Sign with MiniKit
            const response = await MiniKit.commands.signTypedData(payload);

            // Parse MiniKit response (it returns a JSON string)
            const signatureData = typeof response === 'string' ? JSON.parse(response) : response;

            if (signatureData.status !== 'success') {
                throw new Error('User rejected signature');
            }

            const signature = signatureData.signature || signatureData.result?.signature;

            if (!signature) {
                throw new Error('No signature returned from MiniKit');
            }

            // Step 4: Authorize Agent
            setStep('authorizing');

            await authorizeAgent(signature, worldWalletAddress, address);

            console.log('Agent authorized successfully');

            // Step 5: Wait for activation (optional polling)
            const finalStatus = await pollAgentStatus(worldWalletAddress, 10, 2000);

            console.log('Agent activated:', finalStatus);

            setStep('complete');
            onComplete?.(address);

        } catch (err) {
            console.error('Activation error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            setStep('error');
        }
    };

    return (
        <div className="agent-activation">
            <h2>Activate Your Trading Agent</h2>

            {/* Strategy Selection */}
            <div className="strategy-selector">
                <h3>Choose Your Strategy</h3>
                <div className="strategy-options">
                    {(['Conservative', 'Moderate', 'Aggressive'] as const).map((strategy) => (
                        <button
                            key={strategy}
                            onClick={() => setSelectedStrategy(strategy)}
                            className={selectedStrategy === strategy ? 'selected' : ''}
                            disabled={step !== 'idle'}
                        >
                            {strategy}
                        </button>
                    ))}
                </div>

                <div className="leverage-control">
                    <label>Leverage: {leverage}x</label>
                    <input
                        type="range"
                        min="1"
                        max={selectedStrategy === 'Aggressive' ? 5 : 2}
                        value={leverage}
                        onChange={(e) => setLeverage(Number(e.target.value))}
                        disabled={step !== 'idle'}
                    />
                </div>
            </div>

            {/* Activation Button */}
            <button
                onClick={handleActivateAgent}
                disabled={step !== 'idle' && step !== 'error'}
                className="activate-button"
            >
                {step === 'idle' && 'Activate Agent'}
                {step === 'creating' && 'Creating Agent...'}
                {step === 'configuring' && 'Configuring Strategy...'}
                {step === 'signing' && 'Please Sign in World App...'}
                {step === 'authorizing' && 'Authorizing Agent...'}
                {step === 'complete' && '✓ Agent Activated'}
                {step === 'error' && 'Retry'}
            </button>

            {/* Status Messages */}
            {agentAddress && (
                <div className="agent-info">
                    <p>Agent Address: <code>{agentAddress}</code></p>
                </div>
            )}

            {error && (
                <div className="error-message">
                    <p>Error: {error}</p>
                </div>
            )}

            {step === 'complete' && (
                <div className="success-message">
                    <p>✓ Your agent is ready! Fund it with USDC on Hyperliquid to start trading.</p>
                </div>
            )}
        </div>
    );
}
