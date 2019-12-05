/* eslint-env browser */

(function(window, version, script, endpoint) {
  if (!window) return;

  // Set urls outside try block because they are needed in the catch block
  var protocol = "https://";
  var apiUrl = protocol + endpoint;
  var con = window.console;
  var doNotTrack = "doNotTrack";
  var pageviews = "pageviews";
  var events = "events";
  var slash = "/";
  var nav = window.navigator;
  var userAgent = nav.userAgent;
  var loc = window.location;
  var doc = window.document;
  var hostname = loc.hostname;
  var notSending = "Not sending requests ";
  var localhost = "localhost";
  var thousand = 1000;

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

  var scriptElement = doc.querySelector(
    'script[src="' + protocol + script + '"]'
  );
  var attr = function(scriptElement, attribute) {
    return scriptElement && scriptElement.getAttribute("data-" + attribute);
  };

  var mode = attr(scriptElement, "mode");
  var skipDNT = attr(scriptElement, "skip-dnt") === "true";
  var functionName = attr(scriptElement, "sa-global") || "sa";

  // Don't track when Do Not Track is set to true
  if (!skipDNT && doNotTrack in nav && nav[doNotTrack] === "1")
    return warn(notSending + "when " + doNotTrack + " is enabled");

  // Don't track when localhost
  if (hostname === localhost || loc.protocol === "file:")
    return warn(notSending + "from " + localhost);

  // We do advanced bot detection in our API, but this line filters already most bots
  if (!userAgent || userAgent.search(/(bot|spider|crawl)/gi) > -1)
    return warn(notSending + "because bot detected");

  try {
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

    // This code could error on not having resolvedOptions in the Android Webview, that's why we use try...catch
    var timezone;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}

    // We don't want to end up with sensitive data so we clean the referrer URL
    var utmRegexPrefix = "(utm_)?";
    var payload = {
      version: version,
      hostname: hostname,
      timezone: timezone,
      width: window.innerWidth,
      source: {
        source: getParams(utmRegexPrefix + "source|ref"),
        medium: getParams(utmRegexPrefix + "medium"),
        campaign: getParams(utmRegexPrefix + "campaign"),
        referrer:
          (doc.referrer || "")
            .replace(
              /^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/,
              "$4"
            )
            .replace(/^([^/]+)\/$/, "$1") || undefined
      },
      pageviews: [],
      events: []
    };

    // We don't put msHidden in if duration block, because it's used outside of that functionality
    var msHidden = 0;

    /** if duration **/
    var hiddenStart = null;
    window.addEventListener(
      "visibilitychange",
      function() {
        if (doc.hidden) hiddenStart = Date.now();
        else msHidden += Date.now() - hiddenStart;
      },
      false
    );
    /** endif **/

    var seconds = function(since) {
      return Math.round((Date.now() - (since || 0)) / thousand);
    };

    var sendBeacon = "sendBeacon";
    var addEventListenerFunc = window.addEventListener;
    var stringify = JSON.stringify;
    var lastSendUrl;

    // Safari on iOS < 13 has some issues with the Beacon API
    var useSendBeacon =
      sendBeacon in nav &&
      /ip(hone|ad)(.*)os\s([1-9]|1[0-2])_/i.test(userAgent) === false;

    if (useSendBeacon)
      addEventListenerFunc(
        "unload",
        function() {
          var last = payload[pageviews][payload[pageviews].length - 1];

          /** if duration **/
          last[duration] = seconds(start + msHidden);
          msHidden = 0;
          /** endif **/

          /** if scroll **/
          var currentScroll = Math.max(0, scrolled, position());
          if (currentScroll) last.scrolled = currentScroll;
          /** endif **/

          payload.time = seconds();

          nav[sendBeacon](apiUrl + "post", stringify(payload));
        },
        false
      );

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

    var post = function(type, data, isPushState) {
      var payloadType = payload[type];
      if (payloadType.length) {
        /** if duration **/
        payloadType[payloadType.length - 1].duration = seconds(
          start + msHidden
        );
        /** endif **/

        /** if scroll **/
        payloadType[payloadType.length - 1].scrolled = scrolled;
        /** endif **/
      }
      payloadType.push(data);

      if (useSendBeacon) {
        /** if duration **/
        start = Date.now();
        msHidden = 0;
        /** endif **/

        /** if scroll **/
        scrolled = window.setTimeout(position, 100);
        /** endif **/

        return;
      }

      var request = new XMLHttpRequest();
      request.open("POST", apiUrl + type, true);

      if (isPushState) {
        delete payload.source;
      }

      payload.time = seconds();

      // We use content type text/plain here because we don't want to send an
      // pre-flight OPTIONS request
      request.setRequestHeader("Content-Type", "text/plain; charset=UTF-8");
      request.send(stringify(payload));
    };

    var pageview = function(isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var url = loc.pathname;

      /** if hash **/
      // Add hash to url when script is put in to hash mode
      if (mode === "hash" && loc.hash) url += loc.hash.split("?")[0];
      /** endif **/

      // Don't send the last URL again (this could happen when pushState is used to change the URL hash or search)
      if (lastSendUrl === url) return;

      lastSendUrl = url;

      var data = {
        url: url,
        added: seconds()
      };

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
            ? doc.referrer.split(slash)[2] !== hostname
            : true;
      } catch (error) {
        data.error = error.message;
      }
      /** endif **/

      post(pageviews, data, isPushState);
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
      window.onpopstate = function() {
        pageview(1);
      };
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
    var eventFunc = window[functionName];
    var queue = eventFunc && eventFunc.q ? eventFunc.q : [];

    eventFunc = function(event) {
      post(events, event);
    };

    for (var event in queue) post(events, queue[event]);
    /** endif **/
  } catch (e) {
    warn(e.message);
    var url = apiUrl + "image.gif";
    if (e.message) url = url + "?error=" + encodeURIComponent(e.message);
    new Image().src = url;
  }
})(window, "{{version}}", "{{script}}", "{{hostname}}");
