# Atomic Preflight Milestone

This milestone intentionally remains read-only.

It adds a structural preflight model for a two-leg flash-loan arbitrage idea without adding any wallet, signer, token approval, deployment, transaction submission, or state-changing RPC call.

The preflight checks:

- both DEX legs were quoted at the same pinned Base block;
- leg 2 starts with exactly the output of leg 1;
- the modeled ending USDC can repay flash-loan principal plus premium;
- the route still clears the existing conservative profitability policy after modeled costs.

A passing result means only that the route is internally consistent enough for further simulation research. It is not proof that a real atomic transaction will execute, and it is not permission to trade.

Still unproven:

- deployable executor behavior;
- exact executor gas;
- exact Base L1 data fee for executor calldata;
- allowance/approval behavior;
- state changes between observation and inclusion;
- MEV ordering;
- real atomic transaction success.
