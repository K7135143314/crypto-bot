# Safety and Isolation Rules

1. This project is independent from Axtrova OS.
2. Never copy Axtrova secrets or environment variables into this project.
3. Scanner code must remain read-only until a separately approved execution milestone.
4. Never commit a seed phrase, wallet private key, API secret, or signing key.
5. V0.1 must not import wallet clients or expose transaction-sending functions.
6. Any future live-trading capability requires a separate explicit approval and a new security review.
7. Profitability must be net of all DEX fees, gas/L1 data fees, price impact, slippage, MEV/execution risk, and a safety buffer before it can be labeled executable.
