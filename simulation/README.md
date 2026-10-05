# V0.8 Base Fork Simulation

This folder is intentionally separate from the normal scanner runtime.

Purpose: prove one complete atomic path against a pinned copy of Base state without adding any live wallet or transaction-broadcasting path.

The fork test uses:

- Aave V3 `flashLoanSimple` for USDC;
- Aerodrome Classic `swapExactTokensForTokens`;
- Uniswap V3 SwapRouter02 `exactInputSingle`;
- strict minimum outputs;
- a flash-loan repayment requirement;
- a minimum-profit assertion;
- a machine-readable result artifact.

The test accepts either:

- `SUCCESS`: the complete fork transaction repays and clears the configured minimum profit; or
- `CORRECT_REVERT_PROFIT_FLOOR`: both swap legs execute on the fork, but the resulting USDC cannot satisfy repayment/profit requirements and the entire transaction correctly reverts.

A correct revert is simulation proof of the safety gate, not a claim of profit.

No private key, seed phrase, real wallet, real funds, or public transaction broadcast is used.
