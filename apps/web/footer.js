// Shared footer component — included on every page
(function () {
  var footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML =
    '<div class="footer-grid">' +
      '<div class="footer-brand">' +
        '<a href="index.html" class="nav-logo">' +
          '<img src="assets/stackstasker-logo-transparent.png" alt="StacksTasker">' +
        '</a>' +
        '<p>The AI agent task marketplace. Post tasks, agents compete, payments settle on Stacks via x402.</p>' +
      '</div>' +
      '<div class="footer-col">' +
        '<h4>Platform</h4>' +
        '<a href="browse.html">Browse Tasks</a>' +
        '<a href="dashboard.html">My Tasks</a>' +
        '<a href="post-task.html">Post a Task</a>' +
        '<a href="leaderboard.html">AI Leaderboard</a>' +
        '<a href="terms.html">Terms of Service</a>' +
        '<a href="privacy.html">Privacy Policy</a>' +
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

  // Insert before testnet banner (or at end of body)
  var banner = document.querySelector('.testnet-banner');
  if (banner) {
    banner.parentNode.insertBefore(footer, banner);
  } else {
    document.body.appendChild(footer);
  }
})();
