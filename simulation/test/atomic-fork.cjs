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
const MIN_PROFIT_USDC = 1_000_000n;

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

function readScannerPlan() {
  const planPath = path.join(__dirname, '..', 'results', 'scanner-plan.json');
  assert.ok(fs.existsSync(planPath), 'scanner-plan.json must exist before fork test');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  assert.equal(Number(plan.sourceBlock), PINNED_BLOCK);
  assert.equal(plan.routes.length, 2);

  return plan;
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

async function runRoute({ owner, executor, block, premiumBps, route }) {
  const startUsdc = BigInt(route.startUsdcRaw);
  const direction =
    route.direction === 'AERODROME_TO_UNISWAP' ? 0 : 1;

  const plan = {
    direction,
    uniswapFee: Number(route.uniswapFee),
    minWethOut: 1n,
    minUsdcOut: 1n,
    minProfitUsdc: MIN_PROFIT_USDC,
    deadline: BigInt(block.timestamp + 3600),
  };

  let outcome = 'UNKNOWN';
  let economics = null;

  try {
    await executor.connect(owner).runSimulation.staticCall(startUsdc, plan);
    outcome = 'SUCCESS';
  } catch (error) {
    const revertData = findRevertData(error);
    assert.ok(
      revertData,
      `${route.route}: fork call reverted without decodable revert data.`
    );

    let parsed;
    try {
      parsed = executor.interface.parseError(revertData);
    } catch {
      assert.fail(
        `${route.route}: fork call reverted before the explicit profit-floor assertion.`
      );
    }

    assert.equal(
      parsed.name,
      'ProfitFloorNotMet',
      `${route.route}: only the explicit post-swap profit-floor revert counts as a valid safety proof.`
    );

    const [
      endingUsdc,
      repaymentUsdc,
      minProfitUsdc,
      wethAfterLeg1,
      usdcAfterLeg2,
    ] = parsed.args;

    assert.ok(wethAfterLeg1 > 0n, `${route.route}: leg 1 produced no WETH.`);
    assert.ok(usdcAfterLeg2 > 0n, `${route.route}: leg 2 produced no USDC.`);
    assert.ok(
      endingUsdc < repaymentUsdc + minProfitUsdc,
      `${route.route}: profit-floor revert did not represent a real shortfall.`
    );

    outcome = 'CORRECT_REVERT_PROFIT_FLOOR';
    economics = {
      actualWethAfterLeg1Raw: wethAfterLeg1.toString(),
      actualFinalUsdcRaw: usdcAfterLeg2.toString(),
      endingUsdcRaw: endingUsdc.toString(),
      repaymentUsdcRaw: repaymentUsdc.toString(),
      minProfitUsdcRaw: minProfitUsdc.toString(),
    };
  }

  let transactionGasUsed = null;
  let transactionStatus = null;
  let successEconomics = null;

  try {
    const tx = await executor.connect(owner).runSimulation(
      startUsdc,
      plan,
      { gasLimit: 3_000_000n }
    );
    const receipt = await tx.wait();

    transactionGasUsed = receipt.gasUsed.toString();
    transactionStatus = Number(receipt.status);

    if (outcome === 'SUCCESS') {
      const event = receipt.logs
        .map((log) => {
          try {
            return executor.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === 'SimulationPassed');

      assert.ok(event, `${route.route}: successful transaction emitted no SimulationPassed event.`);

      successEconomics = {
        actualWethAfterLeg1Raw: event.args.wethAfterLeg1.toString(),
        actualFinalUsdcRaw: event.args.usdcAfterLeg2.toString(),
        repaymentUsdcRaw: event.args.repayment.toString(),
        profitBeforeGasUsdcRaw: event.args.profitBeforeGas.toString(),
      };
    }
  } catch (error) {
    const receipt = error?.receipt;

    if (receipt) {
      transactionGasUsed = receipt.gasUsed.toString();
      transactionStatus = Number(receipt.status);
    }

    if (outcome !== 'CORRECT_REVERT_PROFIT_FLOOR') {
      throw error;
    }
  }

  if (outcome === 'SUCCESS') {
    assert.equal(transactionStatus, 1);
  } else {
    assert.equal(transactionStatus, 0);
  }

  const actual = successEconomics || economics;

  return {
    route: route.route,
    direction: route.direction,
    candidateAmountUsdc: '100',
    candidateAmountRaw: route.startUsdcRaw,
    uniswapFee: Number(route.uniswapFee),
    aaveFlashLoanPremiumBps: premiumBps.toString(),
    minimumProfitUsdc: '1',
    outcome,
    transactionGasUsed,
    transactionStatus,
    reverted: transactionStatus === 0,
    actualWethAfterLeg1Raw: actual.actualWethAfterLeg1Raw,
    actualFinalUsdcRaw: actual.actualFinalUsdcRaw,
    repaymentUsdcRaw: actual.repaymentUsdcRaw,
    note:
      outcome === 'SUCCESS'
        ? 'Fork-only success. This is simulated execution, not real profit.'
        : 'Both swap legs executed on the fork and the explicit profit floor correctly reverted the complete transaction.',
  };
}

describe('V0.8 hybrid atomic Base-fork proof', function () {
  this.timeout(240_000);

  it('executes both scanner routes against the same pinned Base state and proves success-or-safe-revert behavior', async function () {
    const network = await ethers.provider.getNetwork();
    assert.equal(network.chainId, 8453n);

    const block = await ethers.provider.getBlock('latest');
    assert.ok(block);
    assert.equal(block.number, PINNED_BLOCK);

    const scannerPlan = readScannerPlan();
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

    const routes = [];

    for (const route of scannerPlan.routes) {
      routes.push(
        await runRoute({
          owner,
          executor,
          block,
          premiumBps,
          route,
        })
      );
    }

    assert.equal(routes.length, 2);
    assert.ok(
      routes.some((route) => route.direction === 'AERODROME_TO_UNISWAP'),
      'Aerodrome -> Uniswap route was not tested.'
    );
    assert.ok(
      routes.some((route) => route.direction === 'UNISWAP_TO_AERODROME'),
      'Uniswap -> Aerodrome route was not tested.'
    );

    const result = {
      milestone: 'V0.8',
      simulationOnly: true,
      chain: 'Base',
      chainId: 8453,
      sourceBlock: PINNED_BLOCK,
      routes,
    };

    writeResult(result);
    console.log(JSON.stringify(result, null, 2));
  });
});
