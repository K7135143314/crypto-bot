# V0.8 Atomic Preflight

Status: CODED on `simulation/hybrid-atomic-v0.8`.

This is the first safe V0.8 step. It does not add a wallet, signer, deployment script, approval transaction, broadcast path, or live-money execution.

The preflight checks that a scanner candidate is structurally suitable for a later atomic fork simulation:

- both legs use the same pinned Base block;
- the two legs use opposite DEX venues;
- leg 1 starts with the requested USDC amount;
- leg 2 starts with exactly the output of leg 1;
- all modeled amounts are positive;
- ending USDC can repay flash-loan principal plus the current premium;
- the route still clears the existing profitability policy.

Outcomes:

- `REJECT_STRUCTURE`
- `REJECT_NOT_SELF_REPAYING`
- `REJECT_POLICY`
- `SIMULATION_CANDIDATE`

A `SIMULATION_CANDIDATE` is not a trade signal and is not simulation proof. It only means the scanner output is internally consistent enough to pass into the next fork-based atomic simulation layer.

Still unproven at this stage:

- Aave callback execution;
- Aerodrome state-changing swap execution;
- Uniswap V3 state-changing swap execution;
- token allowance behavior inside the receiver contract;
- flash-loan repayment inside one transaction;
- measured atomic transaction gas;
- measured Base L1 data fee for the serialized transaction;
- minimum-profit assertion inside a real forked transaction;
- MEV/order-flow behavior;
- any live-money execution.
