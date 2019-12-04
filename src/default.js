(function(window, version, script, endpoint) {
  if (!window) return;

  // Set urls outside try block because they are needed in the catch block
  var protocol = "https://";
  var apiUrl = protocol + endpoint;
  var con = window.console;
  var doNotTrack = "doNotTrack";
  var pageviews = "pageviews";
  var events = "events";
  var nav = window.navigator;
  var loc = window.location;
  var doc = window.document;
  var hostname = loc.hostname;
  var payload = {
    version: version,
    hostname: hostname,
    pageviews: [],
    events: []
  };

  /** if spa **/
  var pushState = "pushState";
  var dis = window.dispatchEvent;
  /** endif **/

  /** if duration **/
  var duration = "duration";
  var start = Date.now();
  /** endif **/

  /** if scroll **/
  var scrolled = 0;
  /** endif **/

  // A simple log function so the user knows why a request is not being send
  var warn = function(message) {
    if (con && con.warn) con.warn("Simple Analytics: " + message);
  };

  var getParams = function(regex) {
    // From the search we grab the utm_source and ref and save only that
    var matches = loc.search.match(
      new RegExp("[?&](" + regex + ")=([^?&]+)", "gi")
    );
    var match = matches
      ? matches.map(function(m) {
          return m.split("=")[1];
        })
      : [];
    if (match && match[0]) return match[0];
  };

  var secondsSince = function(since) {
    return Math.round((Date.now() - since) / 1000);
  };

  try {
    var sendBeacon = "sendBeacon";
    var userAgent = nav.userAgent;
    var addEventListenerFunc = window.addEventListener;
    var stringify = JSON.stringify;
    var lastSendUrl;
    var notSending = "Not sending requests ";

    // Safari on iOS < 13 has some issues with the Beacon API
    var useSendBeacon =
      sendBeacon in window.navigator &&
      /ip(hone|ad)(.*)os\s([1-9]|1[0-2])_/i.test(userAgent) === false;

    if (useSendBeacon)
      addEventListenerFunc(
        "unload",
        function() {
          var last = payload[pageviews][payload[pageviews].length - 1];

          /** if duration **/
          last[duration] = secondsSince(start);
          /** endif **/

          /** if scroll **/
          var currentScroll = Math.max(0, scrolled, position());
          if (currentScroll) last.scrolled = currentScroll;
          /** endif **/

          if (timezone) payload.timezone = timezone;
          payload.currentTime = Date.now();
          navigator[sendBeacon](apiUrl + "post", stringify(payload));
        },
        false
      );

    var scriptElement = doc.querySelector(
      'script[src="' + protocol + script + '"]'
    );
    var attr = function(scriptElement, attribute) {
      return scriptElement && scriptElement.getAttribute("data-" + attribute);
    };

    /** if scroll **/
    var scroll = "scroll";
    var body = doc.body;
    var documentElement = doc.documentElement;
    var position = function() {
      var Height = "Height";
      var scrollHeight = scroll + Height;
      var offsetHeight = "offset" + Height;
      var clientHeight = "client" + Height;
      var height = Math.max(
        body[scrollHeight],
        body[offsetHeight],
        documentElement[clientHeight],
        documentElement[scrollHeight],
        documentElement[offsetHeight]
      );
      return Math.min(
        100,
        Math.round(
          (100 * (documentElement.scrollTop + documentElement[clientHeight])) /
            height /
            5
        ) * 5
      );
    };

    addEventListenerFunc("load", function() {
      scrolled = position();
      addEventListenerFunc(scroll, function() {
        if (scrolled < position()) scrolled = position();
      });
    });
    /** endif **/

    var mode = attr(scriptElement, "mode");
    var skipDNT = attr(scriptElement, "skip-dnt") === "true";
    var functionName = attr(scriptElement, "sa-global") || "sa";

    // We do advanced bot detection in our API, but this line filters already most bots
    if (!userAgent || userAgent.search(/(bot|spider|crawl)/gi) > -1)
      return warn(notSending + "because bot detected");

    var utmRegexPrefix = "(utm_)?";
    var ref = getParams(utmRegexPrefix + "source|ref");
    var medium = getParams(utmRegexPrefix + "medium");
    var campaign = getParams(utmRegexPrefix + "campaign");

    // We don't want to end up with sensitive data so we clean the referrer URL
    var cleanRef =
      (doc.referrer || "")
        .replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/, "$4")
        .replace(/^([^/]+)\/$/, "$1") || null;

    // This code could error on not having resolvedOptions in the Android Webview, that's why we use try...catch
    var timezone;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}

    var post = function(type, data) {
      if (useSendBeacon) {
        var payloadType = payload[type];
        if (payloadType.length) {
          /** if duration **/
          payloadType[payloadType.length - 1].duration = secondsSince(start);
          /** endif **/

          /** if scroll **/
          payloadType[payloadType.length - 1].scrolled = scrolled;
          /** endif **/
        }
        payloadType.push(data);

        /** if duration **/
        start = Date.now();
        /** endif **/

        /** if scroll **/
        scrolled = 0;
        /** endif **/

        return;
      }

      var request = new XMLHttpRequest();
      request.open("POST", apiUrl + type, true);

      // We use content type text/plain here because we don't want to send an
      // pre-flight OPTIONS request
      request.setRequestHeader("Content-Type", "text/plain; charset=UTF-8");
      request.send(stringify(data));
    };

    var pageview = function(isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var url = loc.protocol + "//" + hostname + loc.pathname;

      // Add hash to url when script is put in to hash mode
      if (mode === "hash" && loc.hash) url += loc.hash.split("?")[0];

      // Don't send the last URL again (this could happen when pushState is used to change the URL hash or search)
      if (lastSendUrl === url) return;

      lastSendUrl = url;

      // Don't track when Do Not Track is set to true
      if (!skipDNT && doNotTrack in nav && nav[doNotTrack] === "1")
        return warn(notSending + "when " + doNotTrack + " is enabled");

      // Don't track when localhost
      if (hostname === "localhost" || loc.protocol === "file:")
        return warn(notSending + "from localhost");

      var data = { url: url, added: Date.now() };
      if (ref) data.urlReferrer = ref;
      if (window.innerWidth) data.width = window.innerWidth;

      if (!isPushState) {
        if (cleanRef) data.referrer = cleanRef;
        if (timezone) data.timezone = timezone;
        data.version = version;
      }

      /** if uniques **/
      // We put new code always in a try block to prevent huge issues
      try {
        var perf = window.performance;
        var navigation = "navigation";
        // Check if back, forward or reload buttons are being use in modern browsers
        var back =
          perf &&
          perf.getEntriesByType &&
          perf.getEntriesByType(navigation)[0] &&
          perf.getEntriesByType(navigation)[0].type
            ? ["reload", "back_forward"].indexOf(
                perf.getEntriesByType(navigation)[0].type
              ) > -1
            : // Check if back, forward or reload buttons are being use in older browsers
              // 1: TYPE_RELOAD, 2: TYPE_BACK_FORWARD
              perf &&
              perf[navigation] &&
              [1, 2].indexOf(perf[navigation].type) > -1;

        // We set unique variable based on pushstate or back navigation, if no match we check the referrer
        data.unique =
          isPushState || back
            ? false
            : doc.referrer
            ? doc.referrer.split("/")[2] !== hostname
            : true;
      } catch (error) {
        data.error = error.message;
      }
      /** endif **/

      post(pageviews, data);
    };

    /** if spa **/
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
      his.pushState = stateListener(pushState);
      addEventListenerFunc(pushState, function() {
        pageview(1);
      });
    }
    /** endif **/

    /** if hash **/
    // When in hash mode, we record a pageview based on the onhashchange function
    if (mode === "hash" && "onhashchange" in window) {
      window.onhashchange = function() {
        pageview(1);
      };
    }
    /** endif **/

    pageview();

    /** if events **/
    var refOrDocRef = ref || cleanRef;
    var queue =
      window[functionName] && window[functionName].q
        ? window[functionName].q
        : [];

    window[functionName] = function(event) {
      post(events, {
        event: event,
        ref: refOrDocRef,
        campaign: campaign,
        medium: medium
      });
    };

    for (var index = 0; index < queue.length; index++)
      post(events, {
        event: queue[index][0],
        ref: refOrDocRef,
        campaign: campaign,
        medium: medium
      });
    /** endif **/
  } catch (e) {
    warn(e.message);
    var url = apiUrl + "image.gif";
    if (e.message) url = url + "?error=" + encodeURIComponent(e.message);
    new Image().src = url;
  }
})(window, "{{version}}", "{{script}}", "{{hostname}}");
