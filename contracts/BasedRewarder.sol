// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

// OpenZeppelin imports for cryptographic and ERC20 token functionality
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// Importing necessary interfaces and dependencies
import "./MuonClient.sol";

contract DibsRewarder is MuonClient, AccessControlUpgradeable {
    using ECDSA for bytes32;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Constants and state variables
    bytes32 public PROJECT_ID; // DiBs Unique Project ID
    address public based; // Reward token
    address public validMuonGateway; // Valid Muon gateway
    uint256 public startTimestamp; // Start timestamp of the reward program

    mapping(address => mapping(uint256 => uint256)) public claimed; // Mapping of user's claimed balance per day. claimed[user][day] = amount
    mapping(uint256 => uint256) public totalReward; // Mapping of total reward per day totalReward[day] = amount

    // Events
    event Reward(uint256 day, uint256 amount);
    event Claim(address indexed user, uint256 day, uint256 amount);
    event SetBased(address indexed based);
    event SetStartTimestamp(uint256 startTimestamp);

    // Errors
    error InvalidSignature();
    error DayNotFinished();

    /// @notice Initialize the contract
    /// @param _based address of the reward token
    /// @param _validMuonGateway address of the valid Muon gateway
    /// @param _admin address of the admin, can set reward token
    /// @param _muonAppId muon app id
    /// @param _muonPublicKey muon public key
    function initialize(
        address _based,
        address _admin,
        uint256 _startTimestamp,
        address _validMuonGateway,
        uint256 _muonAppId,
        PublicKey memory _muonPublicKey
    ) public initializer {
        __MuonClient_init(_muonAppId, _muonPublicKey);
        __AccessControl_init();
        __DiBsRewarder_init(_based, _admin, _startTimestamp, _validMuonGateway);
    }

    /// @notice Initialize the DiBsRewarder contract
    /// @param _based address of the reward token
    /// @param _validMuonGateway address of the valid Muon gateway
    /// @param _admin address of the admin, can set reward token
    function __DiBsRewarder_init(
        address _based,
        address _admin,
        uint256 _startTimestamp,
        address _validMuonGateway
    ) public onlyInitializing {
        based = _based;
        startTimestamp = _startTimestamp;
        validMuonGateway = _validMuonGateway;

        PROJECT_ID = keccak256(
            abi.encodePacked(uint256(block.chainid), address(this))
        );

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /// @notice Fill reward for a given day from the token contract
    /// @param _day day to fill reward for
    /// @param _amount amount of reward to fill
    function fill(uint256 _day, uint256 _amount) external {
        IERC20Upgradeable(based).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        totalReward[_day] += _amount;
        emit Reward(_day, _amount);
    }

    /// @notice Claim reward for a given day - requires valid muon signature
    /// @param _day day to claim reward for
    /// @param _userVolume user's volume for the day
    /// @param _totalVolume total volume for the day
    /// @param _sigTimestamp timestamp of the signature
    /// @param _reqId request id that the signature was obtained from
    /// @param _sign signature of the data
    /// @param _gatewaySignature signature of the data by the gateway (specific Muon node)
    /// reverts if the signature is invalid
    function claim(
        uint256 _day,
        uint256 _userVolume,
        uint256 _totalVolume,
        uint256 _sigTimestamp,
        bytes calldata _reqId,
        SchnorrSign calldata _sign,
        bytes calldata _gatewaySignature
    ) external {
        if (_day >= (block.timestamp - startTimestamp) / 1 days)
            revert DayNotFinished();

        verifyTSSAndGW(
            abi.encodePacked(
                PROJECT_ID,
                msg.sender,
                address(0),
                _day,
                _userVolume,
                _totalVolume,
                _sigTimestamp
            ),
            _reqId,
            _sign,
            _gatewaySignature
        );

        uint256 rewardAmount = (totalReward[_day] * _userVolume) / _totalVolume;
        uint256 withdrawableAmount = rewardAmount - claimed[msg.sender][_day];
        claimed[msg.sender][_day] += withdrawableAmount;

        IERC20Upgradeable(based).safeTransfer(msg.sender, withdrawableAmount);

        emit Claim(msg.sender, _day, rewardAmount);
    }

    /// @notice Set the reward token
    /// @param _based address of the reward token
    function setBased(address _based) external onlyRole(DEFAULT_ADMIN_ROLE) {
        based = _based;
        emit SetBased(_based);
    }

    /// @notice set start timestamp
    /// @param _startTimestamp start timestamp
    function setStartTimestamp(
        uint256 _startTimestamp
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        startTimestamp = _startTimestamp;
        emit SetStartTimestamp(_startTimestamp);
    }

    /// @notice Verifies a Muon signature of the given data
    /// @param _data data being signed
    /// @param _reqId request id that the signature was obtained from
    /// @param _sign signature of the data
    /// @param _gatewaySignature signature of the data by the gateway (specific Muon node)
    /// reverts if the signature is invalid
    function verifyTSSAndGW(
        bytes memory _data,
        bytes calldata _reqId,
        SchnorrSign calldata _sign,
        bytes calldata _gatewaySignature
    ) internal {
        bytes32 _hash = keccak256(abi.encodePacked(muonAppId, _reqId, _data));
        if (!muonVerify(_reqId, uint256(_hash), _sign, muonPublicKey))
            revert InvalidSignature();

        _hash = _hash.toEthSignedMessageHash();
        address gatewaySignatureSigner = _hash.recover(_gatewaySignature);

        if (gatewaySignatureSigner != validMuonGateway)
            revert InvalidSignature();
    }
}
