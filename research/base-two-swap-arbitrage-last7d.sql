-- Read-only Dune research: past-seven-day Base two-swap USDC round trips.
-- Candidate identification ONLY. No verified net-profit conclusions.
WITH swaps AS (
 SELECT block_time, tx_hash, evt_index, project, tx_from,
        token_sold_address, token_bought_address,
        token_sold_amount, token_bought_amount,
        project_contract_address
 FROM dex.trades
 WHERE blockchain='base'
   AND block_time >= now() - INTERVAL '7' DAY
   AND token_sold_amount > 0 AND token_bought_amount > 0
),
pairs AS (
 SELECT tx_hash, MIN(block_time) AS block_time,
        COUNT(*) AS swap_count,
        MIN_BY(token_sold_address,evt_index) AS initial_token,
        MIN_BY(token_bought_address,evt_index) AS intermediate_token,
        MAX_BY(token_sold_address,evt_index) AS final_input,
        MAX_BY(token_bought_address,evt_index) AS final_token,
        MIN_BY(token_sold_amount,evt_index) AS initial_amount,
        MAX_BY(token_bought_amount,evt_index) AS final_amount,
        MIN_BY(project,evt_index) AS first_dex,
        MAX_BY(project,evt_index) AS second_dex,
        MIN_BY(project_contract_address,evt_index) AS first_contract_hint,
        MAX_BY(project_contract_address,evt_index) AS second_contract_hint
 FROM swaps GROUP BY tx_hash HAVING COUNT(*)=2
)
SELECT
 CONCAT('0x',TO_HEX(p.tx_hash)) AS tx_hash,
 p.block_time,
 p.first_dex,p.second_dex,
 CONCAT('0x',TO_HEX(p.intermediate_token)) AS intermediate_token,
 CONCAT('0x',TO_HEX(p.first_contract_hint)) AS first_contract_hint,
 CONCAT('0x',TO_HEX(p.second_contract_hint)) AS second_contract_hint,
 p.initial_amount AS initial_usdc,p.final_amount AS final_usdc,
 p.final_amount-p.initial_amount AS gross_delta_usdc,
 (CAST(t.gas_used AS DOUBLE)*CAST(t.gas_price AS DOUBLE)
  +COALESCE(CAST(t.l1_fee AS DOUBLE),0))/1e18 AS modeled_tx_fee_eth,
 'UNVERIFIED_GROSS_CANDIDATE' AS evidence_grade
FROM pairs p JOIN base.transactions t ON p.tx_hash=t.hash
WHERE p.initial_token=0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913
  AND p.final_token=p.initial_token
  AND p.intermediate_token=p.final_input
  AND t.success=TRUE
  AND t.block_time >= now() - INTERVAL '7' DAY
ORDER BY p.block_time DESC LIMIT 250;
