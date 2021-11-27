// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @author Philippe Dumonet
contract TestERC271 is ERC721 {
    uint256 public nextTokenId;

    // solhint-disable-next-line no-empty-blocks
    constructor() ERC721("Test NFT", "TNFT") {}

    function mint(address _recipient) external {
        _safeMint(_recipient, nextTokenId++);
    }
}
