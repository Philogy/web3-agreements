const { ethers } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = ethers

const toWei = (value) => ethers.utils.parseUnits(value)
const fromWei = (weis) => ethers.utils.formatUnits(weis)

const SCALE = BigNumber.from('10000')
const MIN_LAST_BID_DELAY = BigNumber.from(15 * 60)

const SAFE_TRANSFER_FROM = 'safeTransferFrom(address,address,uint256)'

describe('NFTSale', () => {
  let owner, user1, user2, user3, attacker
  let testNft1, testNft2
  let sale, minBidIncrease

  async function getCurrentTime() {
    return await sale.virtualBlockTimestamp()
  }

  async function increaseTime(increase) {
    await sale.advanceTime(increase)
  }

  async function increaseTimeTo(destTime) {
    const currentTime = await getCurrentTime()
    await increaseTime(destTime.sub(currentTime))
  }

  before(async () => {
    [owner, user1, user2, user3, attacker] = await ethers.getSigners()
    const NFTSaleFactory = await ethers.getContractFactory('VBTestNFTSale')
    minBidIncrease = BigNumber.from('200')
    sale = await NFTSaleFactory.deploy(minBidIncrease)
    const TestERC271Factory = await ethers.getContractFactory('TestERC271')
    testNft1 = await TestERC271Factory.deploy()
    testNft2 = await TestERC271Factory.deploy()
  })
  describe('initial conditions', async () => {
    it('minimum bid increase', async () => {
      expect(await sale.minBidIncrease()).to.equal(minBidIncrease)
    })
    it('correct owner', async () => {
      expect(await sale.beneficiary()).to.equal(owner.address)
    })
    it('default beneficiary is owner', async () => {
      expect(await sale.beneficiary()).to.equal(owner.address)
    })
    it('SCALE is 1e4', async () => {
      expect(await sale.SCALE()).to.equal(SCALE)
    })
    it('minimum last bid delay is 15 mins', async () => {
      expect(await sale.MIN_LAST_BID_DELAY()).to.equal(MIN_LAST_BID_DELAY)
    })
    it('minimum bid is 0', async () => {
      expect(await sale.minimumBid()).to.equal(0)
    })
  })
  describe('setting the beneficiary', () => {
    it('allows owner to set beneficiary', async () => {
      await sale.setBeneficiary(user1.address)
      expect(await sale.beneficiary()).to.equal(user1.address)
      await sale.setBeneficiary(owner.address)
      expect(await sale.beneficiary()).to.equal(owner.address)
    })
    it('disallows non-owners from changing beneficiary', async () => {
      await expect(sale.connect(attacker).setBeneficiary(attacker.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
  })
  describe('NFT deposit / withdraw', () => {
    let tokenId1, tokenId2, tokenId3
    it('allows transferring ERC721 tokens into NFTSale contract', async () => {
      tokenId1 = await testNft1.nextTokenId()
      await testNft1.mint(sale.address)
      expect(await testNft1.ownerOf(tokenId1)).to.equal(sale.address)

      tokenId2 = await testNft1.nextTokenId()
      await testNft1.mint(owner.address)
      await testNft1[SAFE_TRANSFER_FROM](owner.address, sale.address, tokenId2)
      expect(await testNft1.ownerOf(tokenId1)).to.equal(sale.address)

      tokenId3 = await testNft2.nextTokenId()
      await testNft2.mint(user1.address)
      await testNft2.connect(user1)[SAFE_TRANSFER_FROM](user1.address, sale.address, tokenId3)
      expect(await testNft2.ownerOf(tokenId3)).to.equal(sale.address)
    })
    it('allows owner to withdraw tokens', async () => {
      expect(await testNft1.ownerOf(tokenId1)).to.equal(sale.address)
      await sale.withdrawToken(testNft1.address, tokenId1, owner.address)
      expect(await testNft1.ownerOf(tokenId1)).to.equal(owner.address)

      expect(await testNft1.ownerOf(tokenId2)).to.equal(sale.address)
      await sale.withdrawToken(testNft1.address, tokenId2, user1.address)
      expect(await testNft1.ownerOf(tokenId2)).to.equal(user1.address)

      await sale.transferOwnership(user1.address)
      expect(await testNft2.ownerOf(tokenId3)).to.equal(sale.address)
      await sale.connect(user1).withdrawToken(testNft2.address, tokenId3, user2.address)
      expect(await testNft2.ownerOf(tokenId3)).to.equal(user2.address)
      await sale.connect(user1).transferOwnership(owner.address)
      expect(await sale.owner()).to.equal(owner.address)
    })
    it('disallows non-owner from withdrawing NFTs', async () => {
      await testNft1[SAFE_TRANSFER_FROM](owner.address, sale.address, tokenId1)
      await expect(
        sale.connect(attacker).withdrawToken(testNft1.address, tokenId1, attacker.address)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('auction', () => {
    let auctionDeadline, startingBid
    describe('auction start', () => {
      it('disallows non-owner from starting auction', async () => {
        await expect(sale.connect(attacker).startAuction(0, 1)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        )
      })
      it('allows owner to start auction', async () => {
        auctionDeadline = (await getCurrentTime()).add(1000)
        startingBid = toWei('2')
        expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
        expect(await sale.topBid()).to.equal(0)
        expect(await sale.auctionDeadline()).to.equal(0)
        await expect(sale.startAuction(startingBid, auctionDeadline))
          .to.emit(sale, 'AuctionStarted')
          .withArgs(startingBid, auctionDeadline)
        expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
        expect(await sale.topBid()).to.equal(startingBid)
        expect(await sale.auctionDeadline()).to.equal(auctionDeadline)
      })
    })
    describe('auction cancellation', () => {
      it('disallows non-owner to cancel auction', async () => {
        await expect(sale.connect(attacker).cancelAuction()).to.be.revertedWith(
          'Ownable: caller is not the owner'
        )
      })
      it('allows owner to cancel auction', async () => {
        await expect(sale.cancelAuction()).to.emit(sale, 'AuctionCancelled')
      })
      it('disallows cancelation before auction', async () => {
        await expect(sale.cancelAuction()).to.be.revertedWith('NFTSale: No running auction')
      })
    })
    describe('bidded auction', () => {
      let sale1, sale2
      let lastBid
      before(async () => {
        sale1 = sale.connect(user1)
        sale2 = sale.connect(user2)
      })
      it('disallows bids before auction', async () => {
        await expect(sale1.bid({ value: startingBid })).to.be.revertedWith(
          'NFTSale: No running auction'
        )
      })
      it('disallows settlement before auction', async () => {
        await expect(sale1.connect(attacker).settleAuction()).to.be.revertedWith(
          'NFTSale: No running auction'
        )
      })
      it('disallows initial bids below starting', async () => {
        await sale.startAuction(startingBid, auctionDeadline)
        await expect(sale1.bid({ value: startingBid.sub(1) })).to.be.revertedWith(
          'NFTSale: Bid below starting'
        )
      })
      it('accepts initial bid if matching starting bid', async () => {
        expect(await sale.minimumBid()).to.equal(startingBid)
        const bid = startingBid
        await expect(await sale1.bid({ value: bid }))
          .to.changeEtherBalances([user1, sale], [bid.mul(-1), bid])
          .to.emit(sale, 'NewTopBid')
          .withArgs(user1.address, bid)
          .to.not.emit(sale, 'AuctionExtended')
        expect(await sale.topBidder()).to.equal(user1.address)
        expect(await sale.topBid()).to.equal(bid)
        expect(await sale.minimumBid()).to.equal(toWei('2.04'))
        lastBid = bid
      })
      it('disallows subsequent to not include minimum increase', async () => {
        await expect(sale2.bid({ value: startingBid.add(1) })).to.be.revertedWith(
          'NFTSale: Bid below minimum'
        )
      })
      it('allows someone to overbid', async () => {
        expect(await sale.payments(user1.address)).to.equal(0)
        const bid = toWei('2.1')
        await expect(await sale2.bid({ value: bid }))
          .to.changeEtherBalances([user2, sale], [bid.mul(-1), bid.sub(lastBid)])
          .to.emit(sale, 'NewTopBid')
          .withArgs(user2.address, bid)
          .to.not.emit(sale, 'AuctionExtended')
        expect(await sale.payments(user1.address)).to.equal(lastBid)
        expect(await sale.topBidder()).to.equal(user2.address)
        expect(await sale.topBid()).to.equal(bid)
        expect(await sale.minimumBid()).to.equal(toWei('2.142'))
        lastBid = bid
      })
      it('allows withdrawal of outcompeted bid', async () => {
        await expect(await sale.withdrawPayments(user1.address)).to.changeEtherBalance(
          user1,
          startingBid
        )
      })
      it('prevents just-in-time bidding', async () => {
        expect(await sale.auctionDeadline()).to.equal(auctionDeadline)
        const newTime = auctionDeadline.sub(1)
        await increaseTimeTo(newTime)
        const bid = toWei('2.2')
        await expect(await sale1.bid({ value: bid }))
          .to.emit(sale, 'NewTopBid')
          .withArgs(user1.address, bid)
          .to.emit(sale, 'AuctionExtended')
          .withArgs(newTime.add(MIN_LAST_BID_DELAY))
        auctionDeadline = newTime.add(MIN_LAST_BID_DELAY)
        expect(await sale.payments(user2.address)).to.equal(lastBid)
        expect(await sale.auctionDeadline()).to.equal(auctionDeadline)
        expect(await sale.topBidder()).to.equal(user1.address)
        expect(await sale.topBid()).to.equal(bid)
        expect(await sale.minimumBid()).to.equal(toWei('2.244'))
        lastBid = bid
      })
      it('disallows auction settlement before end', async () => {
        await expect(sale.connect(attacker).settleAuction()).to.be.revertedWith(
          'NFTSale: Auction running'
        )
      })
      it('disallows token withdraw before settlement', async () => {
        await increaseTimeTo(auctionDeadline)
        await expect(sale.withdrawToken(testNft1.address, 0, owner.address)).to.be.revertedWith(
          'NFTSale: Auction already started'
        )
      })
      it('settles auction correctly', async () => {
        expect(await sale.owner()).to.equal(owner.address)
        expect(await sale.beneficiary()).to.equal(owner.address)
        await expect(await sale.connect(user3).settleAuction())
          .to.changeEtherBalance(sale, lastBid.mul(-1))
          .to.emit(sale, 'AuctionSettled')
          .withArgs(user1.address, owner.address, lastBid)
          .to.emit(sale, 'OwnershipTransferred')
          .withArgs(owner.address, user1.address)
        expect(await sale.owner()).to.equal(user1.address)
        expect(await sale.beneficiary()).to.equal(user1.address)
        expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
        expect(await sale.topBid()).to.equal(0)
        expect(await sale.auctionDeadline()).to.equal(0)
        expect(await sale.payments(owner.address)).to.equal(lastBid)
        await sale1.transferOwnership(owner.address)
        await sale.setBeneficiary(owner.address)
      })
    })

    it('correctly settles on-hand unbidded auction', async () => {
      const startingPayments = await sale.payments(owner.address)
      const delta = 1
      auctionDeadline = (await getCurrentTime()).add(delta)
      startingBid = toWei('10000')
      await sale.startAuction(startingBid, auctionDeadline)
      expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
      expect(await sale.topBid()).to.equal(startingBid)
      expect(await sale.auctionDeadline()).to.equal(auctionDeadline)
      expect(await sale.payments(owner.address)).to.equal(startingPayments)
      await increaseTime(delta)
      await expect(await sale.connect(user3).settleAuction())
        .to.emit(sale, 'AuctionCancelled')
        .to.not.emit(sale, 'OwnershipTransferred')
      expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
      expect(await sale.topBid()).to.equal(0)
      expect(await sale.auctionDeadline()).to.equal(0)
      expect(await sale.payments(owner.address)).to.equal(startingPayments)
    })
    it('correctly settles off-hand unbidded auction', async () => {
      const startingPayments = await sale.payments(owner.address)
      const delta = 1
      auctionDeadline = (await getCurrentTime()).add(delta)
      startingBid = toWei('10000')
      await sale.startAuction(startingBid, auctionDeadline)
      await sale.renounceOwnership()
      expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
      expect(await sale.topBid()).to.equal(startingBid)
      expect(await sale.auctionDeadline()).to.equal(auctionDeadline)
      expect(await sale.payments(owner.address)).to.equal(startingPayments)
      await increaseTime(delta)
      await expect(await sale.connect(user3).settleAuction())
        .to.emit(sale, 'AuctionCancelled')
        .to.emit(sale, 'OwnershipTransferred')
        .withArgs(ethers.constants.AddressZero, owner.address)
      expect(await sale.topBidder()).to.equal(ethers.constants.AddressZero)
      expect(await sale.topBid()).to.equal(0)
      expect(await sale.auctionDeadline()).to.equal(0)
      expect(await sale.payments(owner.address)).to.equal(startingPayments)
    })
  })

  describe('setting minimum bid increase', async () => {
    it('allows owner to set minBidIncrease', async () => {
      const tempMin = 500
      await sale.setMinBidIncrease(tempMin)
      expect(await sale.minBidIncrease()).to.equal(tempMin)
      await sale.setMinBidIncrease(minBidIncrease)
      expect(await sale.minBidIncrease()).to.equal(minBidIncrease)
    })
    it('disallows non-owner from setting minBidIncrease', async () => {
      await expect(sale.connect(attacker).setMinBidIncrease(0)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
    let auctionDuration = 1000
    it('disallows owner from setting minBidIncrease during auction', async () => {
      await sale.startAuction(toWei('10'), (await getCurrentTime()).add(auctionDuration))
      await expect(sale.setMinBidIncrease(500)).to.be.revertedWith(
        'NFTSale: Auction already started'
      )
    })
    it('disallows owner from setting minBidIncrease after auction (before settlement)', async () => {
      await increaseTime(auctionDuration)
      await expect(sale.setMinBidIncrease(500)).to.be.revertedWith(
        'NFTSale: Auction already started'
      )
    })
    it('allows owner to set minBidIncrease after auction settlement', async () => {
      await sale.settleAuction()
      const tempMin = 500
      await sale.setMinBidIncrease(tempMin)
      expect(await sale.minBidIncrease()).to.equal(tempMin)
      await sale.setMinBidIncrease(minBidIncrease)
      expect(await sale.minBidIncrease()).to.equal(minBidIncrease)
    })
  })
})
