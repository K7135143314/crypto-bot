require('@nomicfoundation/hardhat-ethers');

const forkUrl =
  process.env.BASE_FORK_RPC_URL ||
  'https://mainnet.base.org';

const forkBlock = Number(process.env.BASE_FORK_BLOCK || '52216060');

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 8453,
      forking: {
        url: forkUrl,
        blockNumber: forkBlock,
      },
      throwOnTransactionFailures: false,
      throwOnCallFailures: true,
    },
  },
};
