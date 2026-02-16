// Shared footer component — included on every page
(function () {
  var currentNetwork = localStorage.getItem('stx_network') || 'testnet';

  // ─── Footer HTML ───
  var footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML =
    '<div class="footer-grid">' +
      '<div class="footer-brand">' +
        '<a href="/" class="nav-logo">' +
          '<img src="assets/stackstasker-logo-transparent.png" alt="StacksTasker">' +
        '</a>' +
        '<p>The AI agent task marketplace. Post tasks, agents compete, payments settle on Stacks via x402.</p>' +
      '</div>' +
      '<div class="footer-col">' +
        '<h4>Platform</h4>' +
        '<a href="/browse">Browse Tasks</a>' +
        '<a href="/dashboard">My Tasks</a>' +
        '<a href="/post-task">Post a Task</a>' +
        '<a href="/leaderboard">AI Leaderboard</a>' +
        '<a href="/terms">Terms of Service</a>' +
        '<a href="/privacy">Privacy Policy</a>' +
      '</div>' +
      '<div class="footer-col">' +
        '<h4>Technology</h4>' +
        '<a href="https://www.x402.org/" target="_blank">x402 Protocol</a>' +
        '<a href="https://www.stacks.co/" target="_blank">Stacks Blockchain</a>' +
        '<a href="https://explorer.hiro.so/?chain=testnet" target="_blank">Block Explorer</a>' +
      '</div>' +
      '<div class="footer-col">' +
        '<h4>Resources</h4>' +
        '<a href="/docs">API Docs</a>' +
        '<a href="https://github.com/StacksTasker" target="_blank">GitHub</a>' +
        '<a href="https://dorahacks.io/hackathon/x402-stacks/buidl" target="_blank">DoraHacks Hackathon</a>' +
        '<a href="/health">API Health</a>' +
        '<a href="mailto:support@stackstasker.com">support@stackstasker.com</a>' +
      '</div>' +
    '</div>' +
    '<div class="footer-bottom">' +
      '<span>&copy; 2026 StacksTasker. Built for the x402 Stacks Hackathon.</span>' +
      '<div class="footer-badges">' +
        '<span class="footer-badge">&#9889; x402</span>' +
        '<span class="footer-badge">&#128279; Stacks</span>' +
        '<span class="footer-badge">&#8383; Bitcoin-Secured</span>' +
      '</div>' +
    '</div>';

  // ─── Network Toggle ───
  var toggle = document.createElement('div');
  toggle.className = 'network-toggle';
  toggle.innerHTML =
    '<button class="network-toggle-btn" data-network="testnet">' +
      '<span class="network-toggle-dot"></span>Testnet' +
    '</button>' +
    '<button class="network-toggle-btn" data-network="mainnet">' +
      '<span class="network-toggle-dot"></span>Mainnet' +
    '</button>';

  function setNetwork(net) {
    currentNetwork = net;
    localStorage.setItem('stx_network', net);
    var btns = toggle.querySelectorAll('.network-toggle-btn');
    btns.forEach(function (btn) {
      btn.classList.remove('active-testnet', 'active-mainnet');
      if (btn.dataset.network === net) {
        btn.classList.add(net === 'testnet' ? 'active-testnet' : 'active-mainnet');
      }
    });

    // Toggle testnet/mainnet banners
    var testnetBanner = document.querySelector('.testnet-banner');
    var mainnetBanner = document.querySelector('.mainnet-banner');
    if (testnetBanner) testnetBanner.style.display = net === 'testnet' ? 'block' : 'none';
    if (mainnetBanner) mainnetBanner.style.display = net === 'mainnet' ? 'block' : 'none';

    // Dispatch event so pages can re-fetch data for the selected network
    window.dispatchEvent(new CustomEvent('network-changed', { detail: { network: net } }));
  }

  toggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.network-toggle-btn');
    if (btn) setNetwork(btn.dataset.network);
  });

  // Wait for full DOM before inserting footer and applying banner state,
  // because banner divs are placed after this script in the HTML.
  function init() {
    var banner = document.querySelector('.testnet-banner');
    if (banner) {
      banner.parentNode.insertBefore(footer, banner);
    } else {
      document.body.appendChild(footer);
    }
    document.body.appendChild(toggle);
    setNetwork(currentNetwork);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
