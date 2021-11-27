// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/PullPayment.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @author Philippe Dumonet
contract NFTSale is ERC721Holder, Ownable, PullPayment {
    event AuctionStarted(uint256 startingBid, uint256 deadline);
    event AuctionCancelled();
    event AuctionSettled(
        address indexed successfulBidder,
        address indexed beneficiary,
        uint256 topBid
    );
    event NewTopBid(address indexed bidder, uint256 newBid);
    event AuctionExtended(uint256 newDeadline);

    uint256 internal constant MIN_MIN_BID_INCREASE = 200; // 2%
    uint256 public constant SCALE = 1e4; // 1 => 1 bp (0.0001 / 0.01%)
    uint256 public constant MIN_LAST_BID_DELAY = 15 minutes;

    address public beneficiary;

    uint256 public minBidIncrease; // minimum bid increase in [SCALE]
    uint256 public auctionDeadline;
    address public topBidder;
    uint256 public topBid;

    constructor(uint256 _minBidIncrease) Ownable() PullPayment() {
        _setMinBidIncrease(_minBidIncrease);
        beneficiary = msg.sender;
    }

    modifier beforeAuction() {
        require(auctionDeadline == 0, "NFTSale: Auction already started");
        _;
    }

    modifier duringAuction() {
        require(auctionDeadline > 0, "NFTSale: No running auction");
        require(auctionDeadline > _getBlockTimestamp(), "NFTSale: Auction over");
        _;
    }

    modifier afterAuction() {
        require(auctionDeadline > 0, "NFTSale: No running auction");
        require(_getBlockTimestamp() >= auctionDeadline, "NFTSale: Auction running");
        _;
    }

    function bid() external payable duringAuction {
        uint256 lastTopBid = topBid;
        address lastBidder = topBidder;
        if (lastBidder == address(0)) {
            require(msg.value >= lastTopBid, "NFTSale: Bid below starting");
        } else {
            require(msg.value >= _calcMinBid(lastTopBid), "NFTSale: Bid below minimum");
        }
        topBidder = msg.sender;
        topBid = msg.value;
        if (lastBidder != address(0)) _asyncTransfer(lastBidder, lastTopBid);
        emit NewTopBid(msg.sender, msg.value);
        if (auctionDeadline - _getBlockTimestamp() < MIN_LAST_BID_DELAY) {
            uint256 newDeadline = _getBlockTimestamp() + MIN_LAST_BID_DELAY;
            auctionDeadline = newDeadline;
            emit AuctionExtended(newDeadline);
        }
    }

    function settleAuction() external afterAuction {
        address successfulBidder = topBidder;
        uint256 lastBid = topBid;
        _resetAuction();
        address beneficiary_ = beneficiary;
        if (successfulBidder != address(0)) {
            _transferOwnership(successfulBidder);
            beneficiary = successfulBidder;
            _asyncTransfer(beneficiary_, lastBid);
            emit AuctionSettled(successfulBidder, beneficiary_, lastBid);
        } else {
            if (owner() == address(0)) _transferOwnership(beneficiary_);
            emit AuctionCancelled();
        }
    }

    function startAuction(uint256 _startingBid, uint256 _auctionDeadline)
        external
        onlyOwner
        beforeAuction
    {
        require(_auctionDeadline > _getBlockTimestamp(), "NFTSale: Deadline passed");
        topBid = _startingBid;
        auctionDeadline = _auctionDeadline;
        emit AuctionStarted(_startingBid, _auctionDeadline);
    }

    function cancelAuction() external onlyOwner duringAuction {
        address lastBidder = topBidder;
        uint256 lastBid = topBid;
        _resetAuction();
        if (lastBidder != address(0)) _asyncTransfer(lastBidder, lastBid);
        emit AuctionCancelled();
    }

    function setMinBidIncrease(uint256 _minBidIncrease) external onlyOwner beforeAuction {
        _setMinBidIncrease(_minBidIncrease);
    }

    function setBeneficiary(address _newBeneficiary) external onlyOwner {
        beneficiary = _newBeneficiary;
    }

    function withdrawToken(
        IERC721 _collection,
        uint256 _tokenId,
        address _recipient
    ) external onlyOwner beforeAuction {
        _collection.safeTransferFrom(address(this), _recipient, _tokenId);
    }

    function minimumBid() external view returns (uint256) {
        uint256 lastTopBid = topBid;
        if (topBidder == address(0)) return lastTopBid;
        return _calcMinBid(lastTopBid);
    }

    function _calcMinBid(uint256 _lastTopBid) internal view returns (uint256) {
        return (_lastTopBid * (SCALE + minBidIncrease)) / SCALE;
    }

    function _setMinBidIncrease(uint256 _minBidIncrease) internal {
        require(_minBidIncrease >= MIN_MIN_BID_INCREASE, "NFTSale: Too little minimum");
        minBidIncrease = _minBidIncrease;
    }

    function _resetAuction() internal {
        topBidder = address(0);
        topBid = 0;
        auctionDeadline = 0;
    }

    function _getBlockTimestamp() internal view virtual returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp;
    }
}
