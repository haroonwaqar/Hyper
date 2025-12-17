## World App Mini-App: Bridge USDC (World Chain → HyperEVM/Hyperliquid) via LI.FI

### What this does
- **Input**: amount in USDC
- **Quote**: calls `https://li.quest/v1/quote`
- **Execute**: sends the returned transaction (`to` + calldata `data`) via `MiniKit.commandsAsync.sendTransaction()`

This app displays the selector as the first 4 bytes of `transactionRequest.data` after you fetch a quote.

### Run locally
```bash
npm run dev
```