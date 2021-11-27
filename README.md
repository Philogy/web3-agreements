# Web3 Agreements
This repo will be filled with tested, reusable digital agreements built using EVM
compatible smart contracts. Currently this repo offers the following types of
smart contract based agreements:

* [Multi ERC721 token auction contract ](./contracts/NFTSale.sol)\

## Agreement guides / descriptions
### Multi NFT auction contract (`NFTSale.sol`)
  Basic Properties:
  - **Allows anyone** to deposit various ERC721 tokens (aka NFTs).
  - **Only allows owner** to withdraw tokens before auction has commenced
  - **Only allows owner** to configure the minimum bid increase which determins
    by what percentage following bids have to outsize the previous top bid
  - **Only allows owner** to initiate auction with a set starting bid and
    auction end
  - **Allows anyone** to participate in auctions by bidding native tokens of the
    respective chain (ETH, xDAI, MATIC, BNB, etc.)
  - **Payments are returned** using the pull pattern meaning they have to
    withdrawn using the `withdrawPayments(address account)` method

  Auction:

  - users can bid using the `bid() payable` method
  - The first bid only needs to match the starting bid
  - subsequent bids have to at least match the minimum bid which is equal to the 
    previous top + the minimum percentage increase
  - if the owner does not renounce their ownership they may cancel the
    auction at any time before the deadline
  - bids are always refunded in the case of cancellation
  - if the auction wasn't cancelled and has passed the deadline anyone may
    settle the auction by calling the `settleAuction()` method
  - if someone is outbid their bid gets refunded
  - **winning the auction** transfers the ownership of the auction contract to
    the winner meaning they can withdraw the contained tokens or initiate a new
    auction.
  - **The winning bid** is awarded to the `beneficiary` which is by default the
    auction deployer or the previous auction winner. The `beneficary` can be set
    by the owner via the `setBeneficiary` method
  - **in the case of no bids** the auction can either be cancelled manually
    before the deadline by the owner or is cancelled via the `settleAuction()`
    method. If ownership was renounced it is returned to the `beneficiary`
