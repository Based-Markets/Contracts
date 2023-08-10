// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

contract BasedDeployer is Initializable, AccessControlEnumerableUpgradeable {
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");

    uint256[] public usedSalts;
    mapping(uint256 => address) public deployedContracts;

    function initialize(address admin, address deployer) public initializer {
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DEPLOYER_ROLE, deployer);
    }

    function deploy(
        bytes memory bytecode,
        uint256 salt
    ) public onlyRole(DEPLOYER_ROLE) returns (address contractAddress) {
        assembly {
            contractAddress := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                salt
            )
        }
        require(contractAddress != address(0), "create2 failed");

        deployedContracts[salt] = contractAddress;
        usedSalts.push(salt);

        return contractAddress;
    }

    function deployMany(
        bytes memory bytecode,
        uint256[] memory salts
    )
        external
        onlyRole(DEPLOYER_ROLE)
        returns (address[] memory contractAddresses)
    {
        contractAddresses = new address[](salts.length);
        for (uint256 i; i < contractAddresses.length; ++i) {
            contractAddresses[i] = deploy(bytecode, salts[i]);
        }
    }

    function getDeployAddress(
        bytes calldata bytecode,
        uint256 salt
    ) public view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                address(this),
                                salt,
                                keccak256(bytecode)
                            )
                        )
                    )
                )
            );
    }

    function usedSaltsLength() external view returns (uint256) {
        return usedSalts.length;
    }
}
