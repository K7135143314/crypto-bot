const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');
const { ethers } = hre;

const ADDRESSES = {
  aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  weth: '0x4200000000000000000000000000000000000006',
  aerodromeRouter: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  aerodromeFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  uniswapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
};

const PINNED_BLOCK = Number(process.env.BASE_FORK_BLOCK || '52216060');
const START_USDC = 100_000_000n;
const MIN_PROFIT_USDC = 1_000_000n;
const UNISWAP_FEE = 100;

const aaveAbi = [
  'function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)',
];

function findRevertData(error) {
  const candidates = [
    error?.data,
    error?.error?.data,
    error?.info?.error?.data,
    error?.cause?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('0x')) {
      return candidate;
    }

    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.data === 'string' &&
      candidate.data.startsWith('0x')
    ) {
      return candidate.data;
    }
  }

  return null;
}

function writeResult(result) {
  const resultDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultDir, 'atomic-fork-result.json'),
    JSON.stringify(result, null, 2) + '\n',
    'utf8'
  );
}

describe('V0.8 hybrid atomic Base-fork proof', function () {
  this.timeout(180_000);

  it('runs Aave -> Aerodrome -> Uniswap and either clears profit or correctly reverts at the profit floor', async function () {
    const network = await ethers.provider.getNetwork();
    assert.equal(network.chainId, 8453n);

    const block = await ethers.provider.getBlock('latest');
    assert.ok(block);
    assert.equal(block.number, PINNED_BLOCK);

    const [owner] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('HybridAtomicSimulator');
    const executor = await Factory.deploy(
      ADDRESSES.aavePool,
      ADDRESSES.usdc,
      ADDRESSES.weth,
      ADDRESSES.aerodromeRouter,
      ADDRESSES.aerodromeFactory,
      ADDRESSES.uniswapRouter
    );
    await executor.waitForDeployment();

    const aave = new ethers.Contract(
      ADDRESSES.aavePool,
      aaveAbi,
      ethers.provider
    );
    const premiumBps = await aave.FLASHLOAN_PREMIUM_TOTAL();

    const deadline = BigInt(block.timestamp + 3600);
    const plan = {
      direction: 0,
      uniswapFee: UNISWAP_FEE,
      minWethOut: 1n,
      minUsdcOut: 1n,
      minProfitUsdc: MIN_PROFIT_USDC,
      deadline,
    };

    let staticOutcome = 'UNKNOWN';
    let staticEconomics = null;

    try {
      await executor.connect(owner).runSimulation.staticCall(START_USDC, plan);
      staticOutcome = 'SUCCESS';
    } catch (error) {
      const revertData = findRevertData(error);
      assert.ok(
        revertData,
        'Fork call reverted without decodable revert data; this is not an accepted safety proof.'
      );

      let parsed;
      try {
        parsed = executor.interface.parseError(revertData);
      } catch {
        assert.fail(
          'Atomic fork call reverted before the explicit profit-floor assertion.'
        );
      }

      assert.equal(
        parsed.name,
        'ProfitFloorNotMet',
        'Only the explicit post-swap profit-floor revert counts as a correct V0.8 safety proof.'
      );

      const [
        endingUsdc,
        repaymentUsdc,
        minProfitUsdc,
        wethAfterLeg1,
        usdcAfterLeg2,
      ] = parsed.args;

      assert.ok(wethAfterLeg1 > 0n, 'Leg 1 did not produce WETH.');
      assert.ok(usdcAfterLeg2 > 0n, 'Leg 2 did not produce USDC.');
      assert.ok(
        endingUsdc < repaymentUsdc + minProfitUsdc,
        'Profit-floor revert did not represent an actual shortfall.'
      );

      staticOutcome = 'CORRECT_REVERT_PROFIT_FLOOR';
      staticEconomics = {
        wethAfterLeg1: wethAfterLeg1.toString(),
        usdcAfterLeg2: usdcAfterLeg2.toString(),
        endingUsdc: endingUsdc.toString(),
        repaymentUsdc: repaymentUsdc.toString(),
        minProfitUsdc: minProfitUsdc.toString(),
      };
    }

    let gasUsed = null;
    let receiptStatus = null;
    let successEconomics = null;

    try {
      const tx = await executor.connect(owner).runSimulation(
        START_USDC,
        plan,
        { gasLimit: 3_000_000n }
      );
      const receipt = await tx.wait();

      gasUsed = receipt.gasUsed.toString();
      receiptStatus = Number(receipt.status);

      if (staticOutcome === 'SUCCESS') {
        const event = receipt.logs
          .map((log) => {
            try {
              return executor.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => parsed?.name === 'SimulationPassed');

        assert.ok(event, 'Successful fork transaction did not emit SimulationPassed.');

        successEconomics = {
          wethAfterLeg1: event.args.wethAfterLeg1.toString(),
          usdcAfterLeg2: event.args.usdcAfterLeg2.toString(),
          repaymentUsdc: event.args.repayment.toString(),
          profitBeforeGasUsdc: event.args.profitBeforeGas.toString(),
        };
      }
    } catch (error) {
      const receipt = error?.receipt;
      if (receipt) {
        gasUsed = receipt.gasUsed.toString();
        receiptStatus = Number(receipt.status);
      }

      if (staticOutcome !== 'CORRECT_REVERT_PROFIT_FLOOR') {
        throw error;
      }
    }

    if (staticOutcome === 'SUCCESS') {
      assert.equal(receiptStatus, 1);
    } else {
      assert.equal(receiptStatus, 0);
    }

    const result = {
      milestone: 'V0.8',
      simulationOnly: true,
      chain: 'Base',
      chainId: 8453,
      sourceBlock: PINNED_BLOCK,
      route: 'Aerodrome -> Uniswap v3',
      candidateAmountUsdc: '100',
      candidateAmountRaw: START_USDC.toString(),
      uniswapFee: UNISWAP_FEE,
      aaveFlashLoanPremiumBps: premiumBps.toString(),
      minimumProfitUsdc: '1',
      outcome: staticOutcome,
      transactionGasUsed: gasUsed,
      transactionStatus: receiptStatus,
      reverted: receiptStatus === 0,
      revertEconomics: staticEconomics,
      successEconomics,
      note:
        staticOutcome === 'SUCCESS'
          ? 'Fork-only success. This is simulated execution, not real profit.'
          : 'Both swap legs executed in the fork call and the explicit profit floor correctly reverted the complete transaction.',
    };

    writeResult(result);
    console.log(JSON.stringify(result, null, 2));
  });
});
