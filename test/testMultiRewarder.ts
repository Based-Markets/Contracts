import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Based, MultiRewarder, TestERC20 } from "../typechain-types";
import { BigNumber } from "ethers";

const MAX_UINT = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

function e(amount: string | number) {
    return ethers.utils.parseEther(String(amount));
}

describe("MultiRewarder", function () {
    let deployer: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress
    let based: Based, multiRewarder: MultiRewarder
    let rewardToken1: TestERC20, rewardToken2: TestERC20


    before(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
    });

    async function deployContracts() {
        const Based = await ethers.getContractFactory('Based')
        const based = await Based.deploy(deployer.address)

        const MultiRewarder = await ethers.getContractFactory('MultiRewarder')
        const multiRewarder = await MultiRewarder.deploy(based.address)

        const TestERC20 = await ethers.getContractFactory('TestERC20')
        const rewardToken1 = await TestERC20.deploy('RT1', 'RT1')
        const rewardToken2 = await TestERC20.deploy('RT2', 'RT2')

        return [based, multiRewarder, rewardToken1, rewardToken2]
    }

    beforeEach(async function () {
        const c = await loadFixture(deployContracts);
        [based, multiRewarder, rewardToken1, rewardToken2] = c

        await rewardToken1.approve(multiRewarder.address, MAX_UINT)
        await rewardToken2.approve(multiRewarder.address, MAX_UINT)

        await based.transfer(user1.address, e(1000))
        await based.transfer(user2.address, e(1000))

        await based.connect(deployer).approve(multiRewarder.address, MAX_UINT)
        await based.connect(user1).approve(multiRewarder.address, MAX_UINT)
        await based.connect(user2).approve(multiRewarder.address, MAX_UINT)
    });

    it("Should deposit based", async function () {

        await multiRewarder.connect(user1).deposit(e(100), user1.address)

        expect(await based.balanceOf(user1.address)).eq(e(900));
        expect(await based.balanceOf(multiRewarder.address)).eq(e(100));
        expect(await multiRewarder.totalSupply()).eq(e(100));
        expect(await multiRewarder.balanceOf(user1.address)).eq(e(100));

        await multiRewarder.connect(user2).deposit(e(150), user2.address)
        expect(await multiRewarder.totalSupply()).eq(e(250));
        expect(await multiRewarder.balanceOf(user2.address)).eq(e(150));
        expect(await multiRewarder.balanceOf(user1.address)).eq(e(100));
    });

    it("Should withdraw based", async function () {
        await multiRewarder.connect(user1).deposit(e(100), user1.address)
        await multiRewarder.connect(user2).deposit(e(150), user2.address)

        await expect(multiRewarder.connect(user1).withdraw(e(101), user1.address)).to.be.revertedWith('Not enough balance')

        await multiRewarder.connect(user1).withdraw(e(50), user1.address)
        expect(await multiRewarder.totalSupply()).eq(e(200))
        expect(await multiRewarder.balanceOf(user1.address)).eq(e(50))
        expect(await based.balanceOf(user1.address)).eq(e(950))

        await multiRewarder.connect(user2).withdraw(e(150), user1.address)
        expect(await multiRewarder.totalSupply()).eq(e(50))
        expect(await multiRewarder.balanceOf(user1.address)).eq(e(50))
        expect(await multiRewarder.balanceOf(user2.address)).eq(0)
        expect(await based.balanceOf(user2.address)).eq(e(850))
        expect(await based.balanceOf(user1.address)).eq(e(1100))
    });

    it("Should update whitelist", async function () {

        await expect(multiRewarder.updateWhitelist(rewardToken1.address, true)).to.be.revertedWith('NOT_ENOUGH_BALANCE')

        await multiRewarder.deposit(e(20e3), deployer.address);
        await expect(multiRewarder.updateWhitelist(rewardToken1.address, true)).to.be.revertedWith('NOT_ENOUGH_BALANCE')

        await multiRewarder.deposit(e(5e3), deployer.address);
        await multiRewarder.updateWhitelist(rewardToken1.address, true)

        await multiRewarder.deposit(e(5e3), deployer.address);
        await multiRewarder.updateWhitelist(rewardToken2.address, true)

        await expect(multiRewarder.updateWhitelist(rewardToken1.address, true)).to.be.revertedWith('ALREADY_DONE')

        expect(await multiRewarder.rewardTokensLength()).eq(2)
        expect(await multiRewarder.isRewardToken(rewardToken1.address)).eq(true)
        expect(await multiRewarder.isRewardToken(rewardToken2.address)).eq(true)
        expect(await multiRewarder.rewardTokens(0)).eq(rewardToken1.address)
        expect(await multiRewarder.rewardTokens(1)).eq(rewardToken2.address)

        await multiRewarder.updateWhitelist(rewardToken1.address, false)
        expect(await multiRewarder.rewardTokensLength()).eq(1)
        expect(await multiRewarder.isRewardToken(rewardToken1.address)).eq(false)
        expect(await multiRewarder.isRewardToken(rewardToken2.address)).eq(true)
        expect(await multiRewarder.rewardTokens(0)).eq(rewardToken2.address)
    })

    it("Should claim rewards", async function () {
        await multiRewarder.connect(user1).deposit(e(100), user1.address)
        await multiRewarder.connect(user2).deposit(e(300), user2.address)

        await multiRewarder.deposit(e(25e3), deployer.address);
        await multiRewarder.updateWhitelist(rewardToken1.address, true)
        await multiRewarder.updateWhitelist(rewardToken2.address, true)
        await multiRewarder.withdraw(e(25e3), deployer.address);

        await multiRewarder.notifyRewardAmount(
            [rewardToken1.address, rewardToken2.address],
            [e(1000), e(2000)],
        )

        await time.increase(7 * 24 * 60 * 60);

        await multiRewarder.connect(user1).getReward()
        await multiRewarder.connect(user2).getReward()

        expect(await rewardToken1.balanceOf(user1.address)).closeTo(e(250), e(1))
        expect(await rewardToken2.balanceOf(user1.address)).closeTo(e(500), e(1))

        expect(await rewardToken1.balanceOf(user2.address)).closeTo(e(750), e(1))
        expect(await rewardToken2.balanceOf(user2.address)).closeTo(e(1500), e(1))
    })

});
