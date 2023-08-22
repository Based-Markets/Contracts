import { impersonateAccount, loadFixture, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Based } from "../typechain-types";
import { IDibsRewarder } from "../typechain-types/contracts/interfaces";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

const MAX_UINT = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

describe("Based", function () {
    let deployer: SignerWithAddress, user: SignerWithAddress
    let based: Based, dibsRewarder: IDibsRewarder
    let startTimestamp: number;

    before(async function () {
        [deployer, user] = await ethers.getSigners();
    });

    async function deployContracts() {
        const Based = await ethers.getContractFactory('Based')
        const based = await Based.deploy(deployer.address)

        const dibsRewarder = await ethers.getContractAt('IDibsRewarder', '0x7AA64eB76100DD214716154DbB105c4d626EA159')

        // set based token in dibs rewarder
        const dibsAdminAddress = "0x6E40691a5DdC2cBC0F2f998Ca686BDF6C777ee29"
        await impersonateAccount(dibsAdminAddress)
        await setBalance(dibsAdminAddress, MAX_UINT)
        const dibsAdmin = await ethers.getSigner(dibsAdminAddress)
        await dibsRewarder.connect(dibsAdmin).setBased(based.address)

        return [based, dibsRewarder]
    }

    beforeEach(async function () {
        const c = await loadFixture(deployContracts);
        [based, dibsRewarder] = c


        startTimestamp = await time.latest() + 24 * 60 * 60;
    });

    it("Only admin should be able to call initialize", async function () {
        await expect(based.connect(user).initialize(dibsRewarder.address, startTimestamp)).to.be.revertedWith("ONLY ADMIN");

        await based.initialize(dibsRewarder.address, startTimestamp);
    });

    it("Should not fill dibs rewarder before startTimestamp", async function () {
        await based.initialize(dibsRewarder.address, startTimestamp);
        await expect(based.fillDibsRewarder(0)).to.be.revertedWith("NOT STARTED")
    });

    it("Should fill dibs rewarder after startTimestamp", async function () {
        await based.initialize(dibsRewarder.address, startTimestamp);
        await time.setNextBlockTimestamp(startTimestamp + 1);
        await based.fillDibsRewarder(0)
        expect(await based.isRewardMinted(0)).eq(true)
        expect(await based.balanceOf(dibsRewarder.address)).eq(await based.getDibsRewardAmount(0))
    });

    it("Should not fill dibs rewarder for future days", async function () {
        await based.initialize(dibsRewarder.address, startTimestamp);
        await time.setNextBlockTimestamp(startTimestamp + 1)
        await expect(based.fillDibsRewarder(1)).to.be.revertedWith("NOT REACHED DAY")
    });

    it("Should not fill dibs rewarder for duplicate days", async function () {
        await based.initialize(dibsRewarder.address, startTimestamp);
        await time.setNextBlockTimestamp(startTimestamp + 1)
        await based.fillDibsRewarder(0)
        const balance = await based.balanceOf(dibsRewarder.address)
        await based.fillDibsRewarder(0)
        expect(await based.balanceOf(dibsRewarder.address)).eq(balance)
    });


});
