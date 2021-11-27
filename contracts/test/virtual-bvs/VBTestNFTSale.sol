// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.10;

import "../../NFTSale.sol";

/// @author Philippe Dumonet
contract VBTestNFTSale is NFTSale {
    uint256 public virtualBlockTimestamp;

    constructor(uint256 _minBidIncrease) NFTSale(_minBidIncrease) {}

    function advanceTime(uint256 _timeDelta) external {
        virtualBlockTimestamp += _timeDelta;
    }

    function _getBlockTimestamp() internal view override returns (uint256) {
        return virtualBlockTimestamp;
    }
}
