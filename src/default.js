/* eslint-env browser */

(function(
  window,
  baseUrl,
  apiUrlPrefix,
  apiUrlSuffix,
  onlineUrlPrefix,
  onlineUrlSuffix,
  version
) {
  if (!window) return;

  var https = "https:";
  var protocol = https + "//";

  // Generate the needed URLs, this seems like a lot of repetition, but it
  // makes our script availble for multple destination which prevents us to
  // need multiple scripts. The minified version stays small.
  var fullApiUrl = protocol + apiUrlPrefix + baseUrl + apiUrlSuffix;
  /** if online **/
  var fullOnlineUrl = protocol + onlineUrlPrefix + baseUrl + onlineUrlSuffix;
  /** endif **/

  // Set urls outside try block because they are needed in the catch block
  var con = window.console;
  var doNotTrack = "doNotTrack";
  var pageviews = "pageviews";
  var events = "events";
  var slash = "/";
  var nav = window.navigator;
  var userAgent = nav.userAgent;
  var loc = window.location;
  var doc = window.document;
  var locationHostname = loc.hostname;
  var notSending = "Not sending requests ";
  var localhost = "localhost";
  var contentTypeText = "Content-Type";

  // We use content type text/plain here because we don't want to send an
  // pre-flight OPTIONS request
  var contentTypeTextPlain = "text/plain; charset=UTF-8";
  var thousand = 1000;
  var addEventListenerFunc = window.addEventListener;

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

  var scriptElement = doc.querySelector('script[src*="' + baseUrl + '"]');
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
  if (locationHostname === localhost || loc.protocol === "file:")
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
    } catch (e) {
      /* Do nothing */
    }

    // We don't want to end up with sensitive data so we clean the referrer URL
    var utmRegexPrefix = "(utm_)?";
    var payload = {
      version: version,
      hostname: locationHostname,
      https: loc.protocol === https,
      timezone: timezone,
      width: window.innerWidth,
      source: {
        source: getParams(utmRegexPrefix + "source|source|ref"),
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
      pageviews: []
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
    var stringify = JSON.stringify;
    var lastSendPath;

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

          nav[sendBeacon](fullApiUrl, stringify(payload));
        },
        false
      );

    /** if scroll **/
    var scroll = "scroll";
    var body = doc.body || {};
    var documentElement = doc.documentElement || {};
    var position = function() {
      var Height = "Height";
      var scrollHeight = scroll + Height;
      var offsetHeight = "offset" + Height;
      var clientHeight = "client" + Height;
      var documentClientHeight = documentElement[clientHeight] || 0;
      var height = Math.max(
        body[scrollHeight] || 0,
        body[offsetHeight] || 0,
        documentElement[clientHeight] || 0,
        documentElement[scrollHeight] || 0,
        documentElement[offsetHeight] || 0
      );
      return Math.min(
        100,
        Math.round(
          (100 * ((documentElement.scrollTop || 0) + documentClientHeight)) /
            height /
            5
        ) * 5
      );
    };

    addEventListenerFunc("load", function() {
      scrolled = position();
      addEventListenerFunc(
        scroll,
        function() {
          if (scrolled < position()) scrolled = position();
        },
        false
      );
    });
    /** endif **/

    var post = function(type, data, isPushState) {
      var payloadPageviews = payload[pageviews];
      var payloadPageviewsLength = payloadPageviews
        ? payloadPageviews.length
        : 0;
      var payloadPageviewLast = payloadPageviewsLength
        ? payloadPageviews[payloadPageviewsLength - 1]
        : null;

      if (type === events) {
        /** if events **/
        var event = "" + data;
        if (payloadPageviewLast) {
          if (payloadPageviewLast[events])
            payloadPageviewLast[events].push(event);
          else payloadPageviewLast[events] = [event];
        } else if (useSendBeacon) {
          warn("Couldn't save event '" + event + "'");
        }

        if (useSendBeacon) return;
        else {
          delete payload[pageviews];
          payload[events] = [event];
        }
        /** endif **/
      } else {
        // Continue when type is pageviews
        if (payloadPageviewsLength) {
          /** if duration **/
          payloadPageviewLast.duration = seconds(start + msHidden);
          /** endif **/

          /** if scroll **/
          payloadPageviewLast.scrolled = scrolled;
          /** endif **/
        }
        payloadPageviews.push(data);

        /** if online **/
        try {
          var requestCounter = new XMLHttpRequest();
          // fullOnlineUrl || fullOnlineUrl is a hack to make the minifier believe
          // this variable is used multiple times. It does not result in extra
          // bytes.
          requestCounter.open("POST", fullOnlineUrl || fullOnlineUrl, true);
          requestCounter.setRequestHeader(
            contentTypeText,
            contentTypeTextPlain
          );
          requestCounter.send(stringify(payload));
        } catch (error) {
          // Do nothing
        }
        /** endif **/

        if (useSendBeacon) {
          /** if duration **/
          start = Date.now();
          msHidden = 0;
          /** endif **/

          /** if scroll **/
          scrolled = window.setTimeout(position, 500);
          /** endif **/

          return;
        }
      }

      var request = new XMLHttpRequest();
      request.open("POST", fullApiUrl, true);

      if (isPushState) {
        delete payload.source;
      }

      payload.time = seconds();

      request.setRequestHeader(contentTypeText, contentTypeTextPlain);
      request.send(stringify(payload));

      delete payload[pageviews];
      delete payload[events];
    };

    var pageview = function(isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var path = loc.pathname;

      /** if hash **/
      // Add hash to path when script is put in to hash mode
      if (mode === "hash" && loc.hash) path += loc.hash.split("?")[0];
      /** endif **/

      // Don't send the last path again (this could happen when pushState is used to change the path hash or search)
      if (lastSendPath === path) return;

      lastSendPath = path;

      var data = {
        path: path,
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
            ? doc.referrer.split(slash)[2] !== locationHostname
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
      addEventListenerFunc(
        pushState,
        function() {
          pageview(1);
        },
        false
      );
      addEventListenerFunc(
        "popstate",
        function() {
          pageview(1);
        },
        false
      );
    }
    /** endif **/

    /** if hash **/
    // When in hash mode, we record a pageview based on the onhashchange function
    if (mode === "hash" && "onhashchange" in window) {
      addEventListenerFunc(
        "hashchange",
        function() {
          pageview(1);
        },
        false
      );
    }
    /** endif **/

    pageview();

    /** if events **/
    var defaultEventFunc = function(event) {
      post(events, event);
    };

    // Set default function if user didn't define a function
    if (!window[functionName]) window[functionName] = defaultEventFunc;

    var eventFunc = window[functionName];

    // Read queue of the user defined function
    var queue = eventFunc && eventFunc.q ? eventFunc.q : [];

    // Overwrite user defined function
    window[functionName] = defaultEventFunc;

    // Post events from the queue of the user defined function
    for (var event in queue) post(events, queue[event]);
    /** endif **/
  } catch (e) {
    warn(e.message);
    var url = fullApiUrl + "image.gif";
    if (e.message) url = url + "?error=" + encodeURIComponent(e.message);
    new Image().src = url;
  }
})(
  window,
  "{{baseUrl}}",
  "{{apiUrlPrefix}}",
  "{{apiUrlSuffix}}",
  "{{onlineUrlPrefix}}",
  "{{onlineUrlSuffix}}",
  "{{version}}"
);
