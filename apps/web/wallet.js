// StacksTasker - Shared wallet utility (connect/disconnect/persist)
// Uses @stacks/connect for Stacks wallet integration
// Recommends Leather wallet but supports any SIP-010 compatible wallet

(function() {
  'use strict';

  var STORAGE_KEY = 'stx_address';
  var STORAGE_NAME_KEY = 'stx_wallet_name';

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

  function connectWallet() {
    // Check if @stacks/connect is available
    if (typeof window.StacksProvider !== 'undefined' || typeof window.LeatherProvider !== 'undefined') {
      // Use native wallet provider
      requestWalletConnection();
    } else {
      // Show install prompt
      showInstallPrompt();
    }
  }

  function requestWalletConnection() {
    try {
      // Try using the Stacks wallet provider
      var provider = window.StacksProvider || window.LeatherProvider || window.HiroWalletProvider;

      if (provider && provider.request) {
        provider.request('getAddresses').then(function(response) {
          var addresses = response.result.addresses || [];
          // Find the STX testnet address (starts with ST)
          var stxAddr = null;
          for (var i = 0; i < addresses.length; i++) {
            if (addresses[i].address && addresses[i].address.startsWith('ST')) {
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
      window.location.href = 'dashboard.html';
    }
  }

  // ─── Nav UI ───

  function updateNavWallet() {
    var container = document.getElementById('wallet-nav');
    if (!container) return;

    var addr = getConnectedAddress();

    if (addr) {
      container.innerHTML =
        '<div class="wallet-connected">' +
          '<a href="dashboard.html" class="nav-link wallet-dashboard-link">My Tasks</a>' +
          '<span class="wallet-addr">' + truncateAddress(addr) + '</span>' +
          '<button class="wallet-disconnect" onclick="window.StacksTaskerWallet.disconnect()" title="Disconnect wallet">&times;</button>' +
        '</div>';
    } else {
      container.innerHTML =
        '<button class="btn-wallet" onclick="window.StacksTaskerWallet.connect()">' +
          'Connect Wallet' +
        '</button>';
    }
  }

  // ─── Public API ───

  window.StacksTaskerWallet = {
    connect: connectWallet,
    disconnect: disconnectWallet,
    getAddress: getConnectedAddress,
    truncate: truncateAddress,
    updateNav: updateNavWallet,
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNavWallet);
  } else {
    updateNavWallet();
  }
})();
