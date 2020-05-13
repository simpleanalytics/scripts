/* eslint-env browser */

(function (window, overwriteOptions, baseUrl, apiUrlPrefix, version, saGlobal) {
  if (!window) return;

  // Generate the needed variables, this seems like a lot of repetition, but it
  // makes our script availble for multple destination which prevents us to
  // need multiple scripts. The minified version stays small.
  var https = "https:";
  var pageviewsText = "pageview";
  var errorText = "error";
  var protocol = https + "//";
  var con = window.console;
  var doNotTrack = "doNotTrack";
  var slash = "/";
  var nav = window.navigator;
  var loc = window.location;
  var hostname = loc.hostname;
  var doc = window.document;
  var notSending = "Not sending requests ";
  var encodeURIComponentFunc = encodeURIComponent;
  var decodeURIComponentFunc = decodeURIComponent;
  var stringify = JSON.stringify;
  var thousand = 1000;
  var addEventListenerFunc = window.addEventListener;
  var fullApiUrl = protocol + apiUrlPrefix + baseUrl;
  var undefinedVar = undefined;

  var payload = {
    version: version,
  };

  // A simple log function so the user knows why a request is not being send
  var warn = function (message) {
    if (con && con.warn) con.warn("Simple Analytics:", message);
  };

  var now = Date.now;

  var uuid = function () {
    var cryptoObject = window.crypto || window.msCrypto;
    var emptyUUID = [1e7] + -1e3 + -4e3 + -8e3 + -1e11;

    if (cryptoObject && cryptoObject.getRandomValues)
      return emptyUUID.replace(/[018]/g, function (c) {
        return (
          c ^
          (cryptoObject.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16);
      });

    return emptyUUID.replace(/[018]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c < 2 ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  var assign = function () {
    var to = {};
    for (var index = 0; index < arguments.length; index++) {
      var nextSource = arguments[index];
      if (nextSource) {
        for (var nextKey in nextSource) {
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };

  // This code could error on not having resolvedOptions in the Android Webview, that's why we use try...catch
  var timezone;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    /* Do nothing */
  }

  // Send data via image
  function sendData(data, callback) {
    data = assign(payload, data);
    var image = new Image();
    if (callback) {
      image.onerror = callback;
      image.onload = callback;
    }
    image.src =
      fullApiUrl +
      "/simple.gif?" +
      Object.keys(data)
        .filter(function (key) {
          return data[key] != undefinedVar;
        })
        .map(function (key) {
          return (
            encodeURIComponentFunc(key) +
            "=" +
            encodeURIComponentFunc(data[key])
          );
        })
        .join("&");
  }

  // Send errors
  function sendError(errorOrMessage) {
    errorOrMessage = errorOrMessage.message || errorOrMessage;
    warn(errorOrMessage);
    sendData({
      type: errorText,
      error: errorOrMessage,
      url: options.hostname + loc.pathname,
    });
  }

  // We listen for the error events and only send errors that are
  // from our script (checked by filename) to our server.
  addEventListenerFunc(
    errorText,
    function (event) {
      if (event.filename && event.filename.indexOf(baseUrl) > -1) {
        sendError(event.message);
      }
    },
    false
  );

  /** if spa **/
  var pushState = "pushState";
  var dis = window.dispatchEvent;
  /** endif **/

  /** if duration **/
  var duration = "duration";
  var start = now();
  /** endif **/

  /** if scroll **/
  var scrolled = 0;
  /** endif **/

  function isBoolean(value) {
    return !!value === value;
  }

  var scriptElement = doc.querySelector('script[src*="' + baseUrl + '"]');
  var attr = function (scriptElement, attribute) {
    return scriptElement && scriptElement.getAttribute("data-" + attribute);
  };

  var options = {
    mode: overwriteOptions.mode || attr(scriptElement, "mode"),
    recordDnt: isBoolean(overwriteOptions.skipDnt)
      ? overwriteOptions.skipDnt
      : attr(scriptElement, "ignore-dnt") == "true" ||
        attr(scriptElement, "skip-dnt") == "true",
    hostname:
      overwriteOptions.hostname || attr(scriptElement, "hostname") || hostname,
    functionName:
      overwriteOptions.saGlobal || attr(scriptElement, "sa-global") || saGlobal,
    ignorePages:
      overwriteOptions.ignorePages || attr(scriptElement, "ignore-pages"),
  };

  // Make sure ignore pages is an array
  var ignorePagesRaw = options.ignorePages;
  var ignorePages = Array.isArray(ignorePagesRaw)
    ? ignorePagesRaw
    : typeof ignorePagesRaw == "string" && ignorePagesRaw.length
    ? ignorePagesRaw.split(/, ?/)
    : [];

  payload.hostname = options.hostname;

  // When a customer overwrites the hostname, we need to know what the original
  // hostname was to hide that domain from referrer traffic
  if (options.hostname !== hostname) payload.hostname_original = hostname;

  // Don't track when Do Not Track is set to true
  if (!options.recordDnt && doNotTrack in nav && nav[doNotTrack] == "1")
    return warn(notSending + "when " + doNotTrack + " is enabled");

  /** unless testing **/
  // Don't track when localhost
  if (hostname.indexOf(".") == -1) return warn(notSending + "from " + hostname);
  /** endunless **/

  try {
    var getParams = function (regex) {
      // From the search we grab the utm_source and ref and save only that
      var matches = loc.search.match(
        new RegExp("[?&](" + regex + ")=([^?&]+)", "gi")
      );
      var match = matches
        ? matches.map(function (m) {
            return m.split("=")[1];
          })
        : [];
      if (match && match[0]) return match[0];
    };

    var page = {};
    var lastPageId = uuid();
    var lastSendPath;

    // We don't want to end up with sensitive data so we clean the referrer URL
    var utmRegexPrefix = "(utm_)?";
    var source = {
      source: getParams(utmRegexPrefix + "source|source|ref"),
      medium: getParams(utmRegexPrefix + "medium"),
      campaign: getParams(utmRegexPrefix + "campaign"),
      term: getParams(utmRegexPrefix + "term"),
      content: getParams(utmRegexPrefix + "content"),
      referrer:
        (doc.referrer || "")
          .replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/, "$4")
          .replace(/^([^/]+)\/$/, "$1") || undefinedVar,
    };

    // We don't put msHidden in if duration block, because it's used outside of that functionality
    var msHidden = 0;

    /** if duration **/
    var hiddenStart;
    window.addEventListener(
      "visibilitychange",
      function () {
        if (doc.hidden) hiddenStart = now();
        else msHidden += now() - hiddenStart;
      },
      false
    );
    /** endif **/

    var sendBeaconText = "sendBeacon";

    var sendOnLeave = function (id, push) {
      var append = { type: "append", original_id: push ? id : lastPageId };

      /** if duration **/
      append[duration] = Math.round((now() - start + msHidden) / thousand);
      msHidden = 0;
      start = now();
      /** endif **/

      /** if scroll **/
      append.scrolled = Math.max(0, scrolled, position());
      /** endif **/

      if (push || !(sendBeaconText in nav)) {
        sendData(append);
      } else {
        nav[sendBeaconText](
          fullApiUrl + "/append",
          stringify(assign(payload, append))
        );
      }
    };

    addEventListenerFunc("unload", sendOnLeave, false);

    /** if scroll **/
    var scroll = "scroll";
    var body = doc.body || {};
    var documentElement = doc.documentElement || {};
    var position = function () {
      try {
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
      } catch (error) {
        return 0;
      }
    };

    addEventListenerFunc("load", function () {
      scrolled = position();
      addEventListenerFunc(
        scroll,
        function () {
          if (scrolled < position()) scrolled = position();
        },
        false
      );
    });
    /** endif **/

    var sendPageView = function (isPushState, deleteSourceInfo) {
      if (isPushState) sendOnLeave("" + lastPageId, true);
      lastPageId = uuid();
      page.id = lastPageId;

      sendData(
        assign(page, deleteSourceInfo ? null : source, {
          https: loc.protocol == https,
          timezone: timezone,
          width: window.innerWidth,
          type: pageviewsText,
        })
      );
    };

    // Ignore pages specified in data-ignore-pages
    var shouldIgnore = function (path) {
      for (var i in ignorePages) {
        var ignorePageRaw = ignorePages[i];
        if (!ignorePageRaw) continue;

        // Prepend a slash when it's missing
        var ignorePage =
          ignorePageRaw[0] == "/" ? ignorePageRaw : "/" + ignorePageRaw;

        if (
          ignorePage === path ||
          new RegExp(ignorePage.replace(/\*/gi, "(.*)"), "gi").test(path)
        )
          return true;
      }
      return false;
    };

    var pageview = function (isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var path = decodeURIComponentFunc(loc.pathname);

      // Ignore pages specified in data-ignore-pages
      if (shouldIgnore(path))
        return warn(notSending + "because " + path + " is ignored");

      /** if hash **/
      // Add hash to path when script is put in to hash mode
      if (options.mode == "hash" && loc.hash) path += loc.hash.split("?")[0];
      /** endif **/

      // Don't send the last path again (this could happen when pushState is used to change the path hash or search)
      if (lastSendPath == path) return;

      lastSendPath = path;

      var data = {
        path: path,
      };

      // If a user does refresh we need to delete the referrer because otherwise it count double
      var perf = window.performance;
      var navigation = "navigation";

      // Check if back, forward or reload buttons are being used in modern browsers
      var userNavigated =
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

      /** if uniques **/
      // We set unique variable based on pushstate or back navigation, if no match we check the referrer
      data.unique =
        isPushState || userNavigated
          ? false
          : doc.referrer
          ? doc.referrer.split(slash)[2] != hostname
          : true;
      /** endif **/

      page = data;

      sendPageView(isPushState, isPushState || userNavigated);
    };

    /** if spa **/
    var his = window.history;
    var hisPushState = his ? his.pushState : undefinedVar;

    // Overwrite history pushState function to
    // allow listening on the pushState event
    if (hisPushState && Event && dis) {
      var stateListener = function (type) {
        var orig = his[type];
        return function () {
          var rv = orig.apply(this, arguments);
          var event;
          if (typeof Event == "function") {
            event = new Event(type);
          } else {
            // Fix for IE
            event = doc.createEvent("Event");
            event.initEvent(type, true, true);
          }
          event.arguments = arguments;
          dis(event);
          return rv;
        };
      };

      his.pushState = stateListener(pushState);

      addEventListenerFunc(
        pushState,
        function () {
          pageview(1);
        },
        false
      );

      addEventListenerFunc(
        "popstate",
        function () {
          pageview(1);
        },
        false
      );
    }
    /** endif **/

    /** if hash **/
    // When in hash mode, we record a pageview based on the onhashchange function
    if (options.mode == "hash" && "onhashchange" in window) {
      addEventListenerFunc(
        "hashchange",
        function () {
          pageview(1);
        },
        false
      );
    }
    /** endif **/

    pageview();

    /** if events **/
    var sessionId = uuid();
    var validTypes = ["string", "number"];

    var sendEvent = function (event, callbackRaw) {
      var isFunction = event instanceof Function;
      var callback =
        callbackRaw instanceof Function ? callbackRaw : function () {};

      if (validTypes.indexOf(typeof event) < 0 && !isFunction) {
        warn("event is not a string: " + event);
        return callback();
      }

      try {
        if (isFunction) {
          event = event();
          if (validTypes.indexOf(typeof event) < 0) {
            warn("event function output is not a string: " + event);
            return callback();
          }
        }
      } catch (error) {
        warn("in your event function: " + error.message);
        return callback();
      }

      event = ("" + event).replace(/[^a-z0-9]+/gi, "_").replace(/(^_|_$)/g, "");
      if (event)
        sendData(
          assign(source, {
            type: "event",
            event: event,
            session_id: sessionId,
          }),
          callback
        );
    };

    var defaultEventFunc = function (event, callback) {
      sendEvent(event, callback);
    };

    // Set default function if user didn't define a function
    if (!window[options.functionName])
      window[options.functionName] = defaultEventFunc;

    var eventFunc = window[options.functionName];

    // Read queue of the user defined function
    var queue = eventFunc && eventFunc.q ? eventFunc.q : [];

    // Overwrite user defined function
    window[options.functionName] = defaultEventFunc;

    // Post events from the queue of the user defined function
    for (var event in queue) sendEvent(queue[event]);
    /** endif **/
  } catch (e) {
    sendError(e);
  }
})(
  window,
  "{{overwriteOptions}}",
  "{{baseUrl}}",
  "{{apiUrlPrefix}}",
  "{{version}}",
  "{{saGlobal}}"
);
