// StacksTasker - Shared wallet utility (connect/disconnect/persist)
// Uses Leather wallet provider for Stacks wallet integration

(function() {
  'use strict';

  var STORAGE_KEY = 'stx_address';
  var STORAGE_NAME_KEY = 'stx_wallet_name';

  // ─── Clarity Value Serialization ───
  // Minimal c32check decoder + Clarity CV serializer for stx_callContract

  var C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function c32Decode(input) {
    var leading = 0;
    for (var i = 0; i < input.length; i++) {
      if (input[i] === '0') { leading++; } else { break; }
    }
    var n = BigInt(0);
    for (var i = 0; i < input.length; i++) {
      var v = C32.indexOf(input[i].toUpperCase());
      if (v < 0) throw new Error('Invalid c32 char: ' + input[i]);
      n = n * 32n + BigInt(v);
    }
    var hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    for (var i = 0; i < leading; i++) { bytes.unshift(0); }
    return bytes;
  }

  function decodeStacksAddress(address) {
    if (address[0] !== 'S') throw new Error('Invalid Stacks address');
    var version = C32.indexOf(address[1].toUpperCase());
    var dataChars = address.substring(2);
    var decoded = c32Decode(dataChars);
    // 20 bytes hash160 + 4 bytes checksum
    var hash160 = decoded.slice(0, 20);
    return { version: version, hash160: hash160 };
  }

  function bytesToHex(bytes) {
    return bytes.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function c32Encode(bytes) {
    // Convert byte array to c32 string (inverse of c32Decode)
    var leading = 0;
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) { leading++; } else { break; }
    }
    var n = BigInt(0);
    for (var i = 0; i < bytes.length; i++) {
      n = n * 256n + BigInt(bytes[i]);
    }
    var chars = [];
    while (n > 0n) {
      chars.unshift(C32[Number(n % 32n)]);
      n = n / 32n;
    }
    for (var i = 0; i < leading; i++) { chars.unshift('0'); }
    return chars.join('');
  }

  function sha256(data) {
    // Synchronous SHA-256 using SubtleCrypto not available; use a simple double-hash via hex
    // For c32check we need sha256(sha256(bytes)) — we'll compute the checksum at encode time
    // Use a lightweight approach: since we control the inputs, compute via crypto.subtle
    return crypto.subtle.digest('SHA-256', new Uint8Array(data));
  }

  /** Convert a Stacks address to a different network (testnet ↔ mainnet) */
  async function convertAddressNetwork(address, targetNetwork) {
    var d = decodeStacksAddress(address);
    // version 22 = mainnet single-sig, 26 = testnet single-sig
    // version 20 = mainnet multi-sig, 21 = testnet multi-sig
    var currentIsMainnet = (d.version === 22 || d.version === 20);
    var wantMainnet = (targetNetwork === 'mainnet');
    if (currentIsMainnet === wantMainnet) return address; // already correct

    var newVersion;
    if (d.version === 26) newVersion = 22;       // testnet single → mainnet single
    else if (d.version === 22) newVersion = 26;   // mainnet single → testnet single
    else if (d.version === 21) newVersion = 20;   // testnet multi → mainnet multi
    else if (d.version === 20) newVersion = 21;   // mainnet multi → testnet multi
    else return address; // unknown version, return as-is

    // Compute c32check: version + hash160 + checksum
    var payload = [newVersion].concat(d.hash160);
    var hash1 = await sha256(payload);
    var hash2 = await sha256(new Uint8Array(hash1));
    var checksum = Array.from(new Uint8Array(hash2)).slice(0, 4);
    var fullData = d.hash160.concat(checksum);
    return 'S' + C32[newVersion] + c32Encode(fullData);
  }

  /** Serialize a Stacks address to a Clarity standard-principal CV hex string */
  function cvPrincipal(address) {
    var d = decodeStacksAddress(address);
    // type 0x05 (standard principal) + version byte + 20-byte hash160
    var bytes = [0x05, d.version].concat(d.hash160);
    return '0x' + bytesToHex(bytes);
  }

  /** Serialize a principal CV with a specific network version override */
  function cvPrincipalForNetwork(address, network) {
    var d = decodeStacksAddress(address);
    var version = d.version;
    // Override version if network doesn't match
    if (network === 'mainnet' && version === 26) version = 22;  // ST → SP
    else if (network === 'mainnet' && version === 21) version = 20;
    else if (network === 'testnet' && version === 22) version = 26;  // SP → ST
    else if (network === 'testnet' && version === 20) version = 21;
    var bytes = [0x05, version].concat(d.hash160);
    return '0x' + bytesToHex(bytes);
  }

  /** Serialize a number to a Clarity uint CV hex string */
  function cvUint(value) {
    // type 0x01 + 16 bytes big-endian uint128
    var n = BigInt(value);
    var hex = n.toString(16).padStart(32, '0');
    return '0x01' + hex;
  }

  // ─── Core Functions ───

  function getConnectedAddress() {
    return localStorage.getItem(STORAGE_KEY) || null;
  }

  function truncateAddress(addr) {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 5) + '...' + addr.slice(-4);
  }

  function disconnectWallet() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
    updateNavWallet();
    window.dispatchEvent(new CustomEvent('wallet-disconnected'));
  }

  function getProvider() {
    return window.LeatherProvider || window.StacksProvider || window.HiroWalletProvider;
  }

  function connectWallet() {
    if (getProvider()) {
      requestWalletConnection();
    } else {
      showInstallPrompt();
    }
  }

  function requestWalletConnection() {
    try {
      var provider = getProvider();

      if (provider && provider.request) {
        provider.request('getAddresses').then(function(response) {
          var addresses = response.result.addresses || [];
          // Find the STX address (prefer SP for mainnet, ST for testnet)
          var stxAddr = null;
          for (var i = 0; i < addresses.length; i++) {
            if (addresses[i].address && (addresses[i].address.startsWith('SP') || addresses[i].address.startsWith('ST'))) {
              stxAddr = addresses[i].address;
              break;
            }
          }
          // Fallback to first address
          if (!stxAddr && addresses.length > 0) {
            stxAddr = addresses[0].address;
          }

          if (stxAddr) {
            localStorage.setItem(STORAGE_KEY, stxAddr);
            localStorage.setItem(STORAGE_NAME_KEY, 'Leather');
            updateNavWallet();
            window.dispatchEvent(new CustomEvent('wallet-connected', { detail: { address: stxAddr } }));
            redirectIfHomepage();
          }
        }).catch(function(err) {
          console.error('[Wallet] Connection failed:', err);
          showInstallPrompt();
        });
      } else {
        showInstallPrompt();
      }
    } catch (e) {
      console.error('[Wallet] Error:', e);
      showInstallPrompt();
    }
  }

  function showInstallPrompt() {
    // For demo/development: allow manual address entry
    var addr = window.prompt(
      'Connect your Stacks wallet\n\n' +
      'Recommended: Install Leather wallet (leather.io)\n' +
      'Any Stacks wallet works.\n\n' +
      'For testing, enter a testnet STX address (starts with ST):',
      'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'
    );

    if (addr && (addr.startsWith('ST') || addr.startsWith('SP'))) {
      localStorage.setItem(STORAGE_KEY, addr);
      localStorage.setItem(STORAGE_NAME_KEY, 'Manual');
      updateNavWallet();
      window.dispatchEvent(new CustomEvent('wallet-connected', { detail: { address: addr } }));
      redirectIfHomepage();
    }
  }

  // ─── Redirect ───

  function redirectIfHomepage() {
    var path = window.location.pathname;
    if (path === '/' || path === '/index.html' || path.endsWith('/index.html')) {
      window.location.href = '/dashboard';
    }
  }

  // ─── Contract Call ───

  /**
   * Call a Clarity smart contract via the Leather wallet provider.
   * Returns the broadcast transaction ID.
   *
   * @param {string} contractAddress - Deployer address (e.g. SP...)
   * @param {string} contractName    - Contract name (e.g. stackstasker-payments)
   * @param {string} functionName    - Public function name (e.g. pay-task)
   * @param {Array}  functionArgs    - Hex-serialized Clarity value strings (use cv.principal / cv.uint)
   * @param {Array}  postConditions  - SIP-005 post-conditions array
   * @returns {Promise<string>}      - Broadcast transaction ID
   */
  async function callContract(contractAddress, contractName, functionName, functionArgs, postConditions, network) {
    var provider = getProvider();
    if (!provider || !provider.request) {
      throw new Error('No Stacks wallet provider found. Install Leather wallet.');
    }

    var params = {
      contract: contractAddress + '.' + contractName,
      functionName: functionName,
      functionArgs: functionArgs,
      postConditions: postConditions || [],
    };
    if (network) { params.network = network; }

    var response = await provider.request('stx_callContract', params);

    // Handle JSON-RPC error responses
    if (response && response.error) {
      var errMsg = response.error.message || response.error.code || JSON.stringify(response.error);
      throw new Error(errMsg);
    }

    // Leather returns result.txid on successful broadcast
    var txId = response && response.result && (response.result.txid || response.result.txId);
    if (!txId) {
      throw new Error('No transaction ID returned from wallet');
    }
    return txId;
  }

  /**
   * Check if a native wallet provider (Leather/Hiro) is available
   */
  function hasWalletProvider() {
    return !!getProvider();
  }

  // ─── Nav UI ───

  function updateNavWallet() {
    var container = document.getElementById('wallet-nav');
    if (!container) return;

    var addr = getConnectedAddress();

    if (addr) {
      container.innerHTML =
        '<div class="wallet-connected">' +
          '<a href="/dashboard" class="nav-link wallet-dashboard-link">My Tasks</a>' +
          '<button class="wallet-disconnect" onclick="window.StacksTaskerWallet.disconnect()" title="Disconnect wallet">&times;</button>' +
        '</div>';
    } else {
      container.innerHTML = '';
    }
  }

  // ─── Public API ───

  window.StacksTaskerWallet = {
    connect: connectWallet,
    disconnect: disconnectWallet,
    getAddress: getConnectedAddress,
    truncate: truncateAddress,
    updateNav: updateNavWallet,
    callContract: callContract,
    hasWalletProvider: hasWalletProvider,
    cv: {
      principal: cvPrincipal,
      principalForNetwork: cvPrincipalForNetwork,
      uint: cvUint,
    },
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNavWallet);
  } else {
    updateNavWallet();
  }
})();
