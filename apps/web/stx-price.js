/**
 * STX/USD price with 1-day localStorage cache.
 * Loads cached value instantly, refreshes in background when stale.
 *
 * Usage: window.stxPriceUsd is set synchronously from cache (or null),
 *        then updated async if cache is older than 24h.
 *        Listen for 'stx-price-ready' event for post-fetch updates.
 */
(function() {
  var CACHE_KEY = 'stx_usd_price';
  var CACHE_TS_KEY = 'stx_usd_price_ts';
  var ONE_DAY = 24 * 60 * 60 * 1000;

  // Load from cache immediately
  var cached = localStorage.getItem(CACHE_KEY);
  var cachedTs = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);

  if (cached) {
    window.stxPriceUsd = parseFloat(cached);
  }

  var isStale = !cached || (Date.now() - cachedTs > ONE_DAY);

  if (isStale) {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.blockstack && data.blockstack.usd) {
          window.stxPriceUsd = data.blockstack.usd;
          localStorage.setItem(CACHE_KEY, String(data.blockstack.usd));
          localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
          window.dispatchEvent(new Event('stx-price-ready'));
        }
      })
      .catch(function() {});
  }
})();
