(function(window, hostname, path) {
  try {
    if (!window) return;
    var nav = window.navigator;
    var loc = window.location;
    var doc = window.document;
    var con = window.console;
    var userAgent = nav.userAgent;
    var dis = window.dispatchEvent;
    var lastSendUrl;
    var baseUrl = 'https://' + hostname + path
    var notSending = 'Not sending requests '

    var script = doc.querySelector('script[src="' + baseUrl + '.js"]')
    var mode = script ? script.getAttribute('data-mode') : null;
    var skipDNT = script ? script.getAttribute('data-skip-dnt') === 'true' : false;

    // A simple log function so the user knows why a request is not being send
    var warn = function(message) {
      if (con && con.warn) con.warn('Simple Analytics: ' + message);
    }

    // We do advanced bot detection in our API, but this line filters already most bots
    if (userAgent.search(/(bot|spider|crawl)/ig) > -1) return warn(notSending + 'because user agent is a robot');

    var post = function(isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var url = loc.protocol + '//' + loc.hostname + loc.pathname;

      // Add hash to url when script is put in to hash mode
      if (mode === 'hash' && loc.hash) url += loc.hash.split('?')[0];

      // Don't send the last URL again (this could happen when pushState is used to change the URL hash or search)
      if (lastSendUrl === url) return;
      lastSendUrl = url;

      // Skip prerender requests
      if ('visibilityState' in doc && doc.visibilityState === 'prerender') return warn(notSending + 'when prerender');

      // Don't track when Do Not Track is set to true
      if (!skipDNT && 'doNotTrack' in nav && nav.doNotTrack === '1') return warn(notSending + 'when doNotTrack is enabled');

      // Don't track when Do Not Track is set to true
      if (loc.hostname === 'localhost') return warn(notSending + 'from localhost');

      // From the search we grab the utm_source and ref and save only that
      var refMatches = loc.search.match(/[?&](utm_source|source|ref)=([^?&]+)/gi);
      var refs = refMatches ? refMatches.map(function(m) { return m.split('=')[1] }) : [];

      var data = { url: url };
      if (userAgent) data.ua = userAgent;
      if (refs && refs[0]) data.urlReferrer = refs[0];
      if (doc.referrer && !isPushState) data.referrer = doc.referrer;
      if (window.innerWidth) data.width = window.innerWidth;

      try {
        data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch (error) {
        // nothing
      }

      var request = new XMLHttpRequest();
      request.open('POST', baseUrl, true);

      // We use content type text/plain here because we don't want to send an
      // pre-flight OPTIONS request
      request.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
      request.send(JSON.stringify(data));
    }

    // Thanks to https://gist.github.com/rudiedirkx/fd568b08d7bffd6bd372
    var his = window.history;
    var hisPushState = his ? his.pushState : null;
    if (hisPushState && Event && dis) {
      var stateListener = function(type) {
        var orig = his[type];
        return function() {
          var rv = orig.apply(this, arguments);
          var event = new Event(type);
          event.arguments = arguments;
          dis(event);
          return rv;
        };
      };
      his.pushState = stateListener('pushState');
      window.addEventListener('pushState', function() {
        post(true);
      });
    }

    // When in hash mode, we record a pageview based on the onhashchange function
    if (mode === 'hash' && 'onhashchange' in window) {
      window.onhashchange = post
    }

    post();
  } catch (e) {
    var con = con || window.console;
    if (con && con.error) con.error(e);
    var url = baseUrl + '.gif';
    if (e && e.message) url = url + '?error=' + encodeURIComponent(e.message);
    new Image().src = url;
  }
})(window, hostname, path);
