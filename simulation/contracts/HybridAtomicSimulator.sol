// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IAaveV3PoolMinimal {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}

interface IAerodromeRouterMinimal {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IUniswapV3SwapRouter02Minimal {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}

contract HybridAtomicSimulator {
    enum Direction {
        AERODROME_TO_UNISWAP,
        UNISWAP_TO_AERODROME
    }

    struct Plan {
        Direction direction;
        uint24 uniswapFee;
        uint256 minWethOut;
        uint256 minUsdcOut;
        uint256 minProfitUsdc;
        uint256 deadline;
    }

    error NotOwner();
    error UnauthorizedFlashCallback();
    error InvalidFlashAsset();
    error DirtyStartingBalance(uint256 usdcBalance, uint256 wethBalance);
    error ExpiredPlan();
    error ApprovalFailed(address token, address spender);
    error ProfitFloorNotMet(
        uint256 endingUsdc,
        uint256 repaymentUsdc,
        uint256 minProfitUsdc,
        uint256 wethAfterLeg1,
        uint256 usdcAfterLeg2
    );

    event SimulationPassed(
        Direction direction,
        uint256 amountBorrowed,
        uint256 premium,
        uint256 wethAfterLeg1,
        uint256 usdcAfterLeg2,
        uint256 repayment,
        uint256 profitBeforeGas
    );

    address public immutable owner;
    IAaveV3PoolMinimal public immutable aavePool;
    IERC20Minimal public immutable usdc;
    IERC20Minimal public immutable weth;
    IAerodromeRouterMinimal public immutable aerodromeRouter;
    address public immutable aerodromeFactory;
    IUniswapV3SwapRouter02Minimal public immutable uniswapRouter;

    constructor(
        address _aavePool,
        address _usdc,
        address _weth,
        address _aerodromeRouter,
        address _aerodromeFactory,
        address _uniswapRouter
    ) {
        owner = msg.sender;
        aavePool = IAaveV3PoolMinimal(_aavePool);
        usdc = IERC20Minimal(_usdc);
        weth = IERC20Minimal(_weth);
        aerodromeRouter = IAerodromeRouterMinimal(_aerodromeRouter);
        aerodromeFactory = _aerodromeFactory;
        uniswapRouter = IUniswapV3SwapRouter02Minimal(_uniswapRouter);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function runSimulation(
        uint256 amountUsdc,
        Plan calldata plan
    ) external onlyOwner {
        if (block.timestamp > plan.deadline) revert ExpiredPlan();

        uint256 usdcBalance = usdc.balanceOf(address(this));
        uint256 wethBalance = weth.balanceOf(address(this));

        if (usdcBalance != 0 || wethBalance != 0) {
            revert DirtyStartingBalance(usdcBalance, wethBalance);
        }

        aavePool.flashLoanSimple(
            address(this),
            address(usdc),
            amountUsdc,
            abi.encode(plan),
            0
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        if (msg.sender != address(aavePool) || initiator != address(this)) {
            revert UnauthorizedFlashCallback();
        }

        if (asset != address(usdc)) revert InvalidFlashAsset();

        Plan memory plan = abi.decode(params, (Plan));

        if (block.timestamp > plan.deadline) revert ExpiredPlan();

        uint256 wethAfterLeg1;
        uint256 usdcAfterLeg2;

        if (plan.direction == Direction.AERODROME_TO_UNISWAP) {
            wethAfterLeg1 = _swapAerodrome(
                address(usdc),
                address(weth),
                amount,
                plan.minWethOut,
                plan.deadline
            );

            usdcAfterLeg2 = _swapUniswap(
                address(weth),
                address(usdc),
                wethAfterLeg1,
                plan.uniswapFee,
                plan.minUsdcOut
            );
        } else {
            wethAfterLeg1 = _swapUniswap(
                address(usdc),
                address(weth),
                amount,
                plan.uniswapFee,
                plan.minWethOut
            );

            usdcAfterLeg2 = _swapAerodrome(
                address(weth),
                address(usdc),
                wethAfterLeg1,
                plan.minUsdcOut,
                plan.deadline
            );
        }

        uint256 endingUsdc = usdc.balanceOf(address(this));
        uint256 repayment = amount + premium;
        uint256 requiredEnding = repayment + plan.minProfitUsdc;

        if (endingUsdc < requiredEnding) {
            revert ProfitFloorNotMet(
                endingUsdc,
                repayment,
                plan.minProfitUsdc,
                wethAfterLeg1,
                usdcAfterLeg2
            );
        }

        _forceApprove(usdc, address(aavePool), repayment);

        emit SimulationPassed(
            plan.direction,
            amount,
            premium,
            wethAfterLeg1,
            usdcAfterLeg2,
            repayment,
            endingUsdc - repayment
        );

        return true;
    }

    function _swapAerodrome(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        _forceApprove(IERC20Minimal(tokenIn), address(aerodromeRouter), amountIn);

        IAerodromeRouterMinimal.Route[] memory routes =
            new IAerodromeRouterMinimal.Route[](1);

        routes[0] = IAerodromeRouterMinimal.Route({
            from: tokenIn,
            to: tokenOut,
            stable: false,
            factory: aerodromeFactory
        });

        uint256[] memory amounts = aerodromeRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            routes,
            address(this),
            deadline
        );

        amountOut = amounts[amounts.length - 1];
    }

    function _swapUniswap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMin
    ) internal returns (uint256 amountOut) {
        _forceApprove(IERC20Minimal(tokenIn), address(uniswapRouter), amountIn);

        amountOut = uniswapRouter.exactInputSingle(
            IUniswapV3SwapRouter02Minimal.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _forceApprove(
        IERC20Minimal token,
        address spender,
        uint256 amount
    ) internal {
        if (!token.approve(spender, 0)) {
            revert ApprovalFailed(address(token), spender);
        }

        if (!token.approve(spender, amount)) {
            revert ApprovalFailed(address(token), spender);
        }
    }
}
