/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; 2021-02-07; 648c) */
/* eslint-env browser */

(function (window, overwriteOptions, baseUrl, apiUrlPrefix, version, saGlobal) {
  if (!window) return;
  try {
    /////////////////////
    // PREDEFINED VARIABLES FOR BETTER MINIFICATION
    //

    // This seems like a lot of repetition, but it makes our script available for
    // multple destination which prevents us to need multiple scripts. The minified
    // version stays small.
    var https = "https:";
    var pageviewsText = "pageview";
    var errorText = "error";
    var protocol = https + "//";
    var con = window.console;
    var doNotTrack = "doNotTrack";
    var slash = "/";
    var nav = window.navigator;
    var loc = window.location;
    var locationHostname = loc.hostname;
    var doc = window.document;
    var userAgent = nav.userAgent;
    var notSending = "Not sending request ";
    var fetchedHighEntropyValues = false;
    var encodeURIComponentFunc = encodeURIComponent;
    var decodeURIComponentFunc = decodeURIComponent;
    var stringify = JSON.stringify;
    var thousand = 1000;
    var addEventListenerFunc = window.addEventListener;
    var fullApiUrl = protocol + apiUrlPrefix + baseUrl;
    var undefinedVar = undefined;
    var documentElement = doc.documentElement || {};
    var language = "language";
    var Height = "Height";
    var Width = "Width";
    var scroll = "scroll";
    var uaData = nav.userAgentData;
    var scrollHeight = scroll + Height;
    var offsetHeight = "offset" + Height;
    var clientHeight = "client" + Height;
    var clientWidth = "client" + Width;
    var pagehide = "pagehide";
    var platformText = "platform";
    var platformVersionText = "platformVersion";
    var isBotAgent =
      /(bot|spider|crawl)/i.test(userAgent) && !/(cubot)/i.test(userAgent);
    var screen = window.screen;

    /////////////////////
    // PAYLOAD FOR BOTH PAGE VIEWS AND EVENTS
    //

    var bot =
      nav.webdriver ||
      window.__nightmare ||
      "callPhantom" in window ||
      "_phantom" in window ||
      "phantom" in window ||
      isBotAgent;


    var payload = {
      version: version,
      ua: userAgent,
    };
    if (bot) payload.bot = true;

    // Use User-Agent Client Hints for better privacy
    // https://web.dev/user-agent-client-hints/
    if (uaData) {
      payload.mobile = uaData.mobile;
      payload.brands = stringify(uaData.brands);
    }

    /////////////////////
    // HELPER FUNCTIONS
    //

    // A simple log function so the user knows why a request is not being send
    var warn = function (message) {
      if (con && con.warn) con.warn("Simple Analytics:", message);
    };

    var now = Date.now;

    var uuid = function () {
      var cryptoObject = window.crypto || window.msCrypto;
      var emptyUUID = [1e7] + -1e3 + -4e3 + -8e3 + -1e11;
      var uuidRegex = /[018]/g;

      try {
        return emptyUUID.replace(uuidRegex, function (c) {
          return (
            c ^
            (cryptoObject.getRandomValues(new Uint8Array(1))[0] &
              (15 >> (c / 4)))
          ).toString(16);
        });
      } catch (error) {
        return emptyUUID.replace(uuidRegex, function (c) {
          var r = (Math.random() * 16) | 0,
            v = c < 2 ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
    };

    var isFunction = function (func) {
      return typeof func == "function";
    };

    var assign = function () {
      var to = {};
      var arg = arguments;
      for (var index = 0; index < arg.length; index++) {
        var nextSource = arg[index];
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

    var isBoolean = function (value) {
      return !!value === value;
    };

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

    // Ignore pages specified in data-ignore-pages
    var shouldIgnore = function (path) {
      for (var i in ignorePages) {
        var ignorePageRaw = ignorePages[i];
        if (!ignorePageRaw) continue;

        // Prepend a slash when it's missing
        var ignorePage =
          ignorePageRaw[0] == "/" ? ignorePageRaw : "/" + ignorePageRaw;

        try {
          if (
            ignorePage === path ||
            new RegExp(ignorePage.replace(/\*/gi, "(.*)"), "gi").test(path)
          )
            return true;
        } catch (error) {
          return false;
        }
      }
      return false;
    };

    /////////////////////
    // SEND DATA VIA OUR PIXEL
    //

    // Send data via image
    var sendData = function (data, callback) {
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
    };

    /////////////////////
    // ERROR FUNCTIONS
    //

    // Send errors
    var sendError = function (errorOrMessage) {
      errorOrMessage = errorOrMessage.message || errorOrMessage;
      warn(errorOrMessage);
      sendData({
        type: errorText,
        error: errorOrMessage,
        url: definedHostname + loc.pathname,
      });
    };

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

    /////////////////////
    // INITIALIZE VALUES
    //

    var pushState = "pushState";
    var dis = window.dispatchEvent;

    var duration = "duration";
    var start = now();

    var scrolled = 0;

    // This code could error on (incomplete) implementations, that's why we use try...catch
    var timezone;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      /* Do nothing */
    }

    /////////////////////
    // GET SETTINGS
    //

    // Find the script element where options can be set on
    var scriptElement = doc.querySelector('script[src*="' + baseUrl + '"]');
    var attr = function (scriptElement, attribute) {
      return scriptElement && scriptElement.getAttribute("data-" + attribute);
    };

    // Script mode, this can be hash mode for example
    var mode = overwriteOptions.mode || attr(scriptElement, "mode");

    // Should we record Do Not Track visits?
    var collectDnt = isBoolean(overwriteOptions.collectDnt)
      ? overwriteOptions.collectDnt
      : attr(scriptElement, "ignore-dnt") == "true" ||
        attr(scriptElement, "skip-dnt") == "true";

    // Customers can overwrite their hostname, here we check for that
    var definedHostname =
      overwriteOptions.hostname ||
      attr(scriptElement, "hostname") ||
      locationHostname;

    // Some customers want to collect page views manually
    var autoCollect = !(
      attr(scriptElement, "auto-collect") == "false" ||
      overwriteOptions.autoCollect === false
    );

    // Event function name
    var functionName =
      overwriteOptions.saGlobal || attr(scriptElement, "sa-global") || saGlobal;

    // Customers can ignore certain pages
    var ignorePagesRaw =
      overwriteOptions.ignorePages || attr(scriptElement, "ignore-pages");

    // Make sure ignore pages is an array
    var ignorePages = Array.isArray(ignorePagesRaw)
      ? ignorePagesRaw
      : typeof ignorePagesRaw == "string" && ignorePagesRaw.length
      ? ignorePagesRaw.split(/, ?/)
      : [];

    /////////////////////
    // ADD HOSTNAME TO PAYLOAD
    //

    payload.hostname = definedHostname;

    /////////////////////
    // ADD WARNINGS
    //

    // Warn when no document.doctype is defined (this breaks some documentElement dimensions)
    if (!doc.doctype) warn("Add DOCTYPE html for more accurate dimensions");

    // When a customer overwrites the hostname, we need to know what the original
    // hostname was to hide that domain from referrer traffic
    if (definedHostname !== locationHostname)
      payload.hostname_original = locationHostname;

    // Don't track when Do Not Track is set to true
    if (!collectDnt && doNotTrack in nav && nav[doNotTrack] == "1")
      return warn(notSending + "when " + doNotTrack + " is enabled");

    // Don't track when localhost or when it's an IP address
    if (
      locationHostname.indexOf(".") == -1 ||
      /^[0-9]+$/.test(locationHostname.replace(/\./g, ""))
    )
      return warn(notSending + "from " + locationHostname);

    /////////////////////
    // SETUP INITIAL VARIABLES
    //

    var page = {};
    var lastPageId = uuid();
    var lastSendPath;

    // We don't want to end up with sensitive data so we clean the referrer URL
    var referrer =
      (doc.referrer || "")
        .replace(locationHostname, definedHostname)
        .replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/, "$4")
        .replace(/^([^/]+)$/, "$1") || undefinedVar;

    // The prefix utm_ is optional
    var utmRegexPrefix = "(utm_)?";
    var source = {
      source: getParams(utmRegexPrefix + "source|ref"),
      medium: getParams(utmRegexPrefix + "medium"),
      campaign: getParams(utmRegexPrefix + "campaign"),
      term: getParams(utmRegexPrefix + "term"),
      content: getParams(utmRegexPrefix + "content"),
      referrer: referrer,
    };

    /////////////////////
    // TIME ON PAGE AND SCROLLED LOGIC
    //

    // We don't put msHidden in if duration block, because it's used outside of that functionality
    var msHidden = 0;

    var sendBeaconText = "sendBeacon";

    var sendOnLeave = function (id, push) {
      var append = { type: "append", original_id: push ? id : lastPageId };

      append[duration] = Math.round((now() - start - msHidden) / thousand);
      msHidden = 0;
      start = now();

      append.scrolled = Math.max(0, scrolled, position());

      if (push || !(sendBeaconText in nav)) {
        sendData(append);
      } else {
        nav[sendBeaconText](
          fullApiUrl + "/append",
          stringify(assign(payload, append))
        );
      }
    };

    var hiddenStart;
    window.addEventListener(
      "visibilitychange",
      function () {
        if (doc.hidden) {
          if (!("on" + pagehide in window)) sendOnLeave();
          hiddenStart = now();
        } else msHidden += now() - hiddenStart;
      },
      false
    );

    addEventListenerFunc(pagehide, sendOnLeave, false);

    var body = doc.body || {};
    var position = function () {
      try {
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

    /////////////////////
    // ACTUAL PAGE VIEW LOGIC
    //

    var getPath = function (overwrite) {
      var path = "";

      // decodeURIComponent can fail when having invalid characters
      // https://github.com/simpleanalytics/roadmap/issues/462
      try {
        path = overwrite || decodeURIComponentFunc(loc.pathname);
      } catch (e) {
        // Do nothing
      }

      // Ignore pages specified in data-ignore-pages
      if (shouldIgnore(path)) {
        warn(notSending + "because " + path + " is ignored");
        return;
      }

      // Add hash to path when script is put in to hash mode
      if (mode == "hash" && loc.hash) path += loc.hash.split("?")[0];

      return path;
    };

    // Send page view and append data to it
    var sendPageView = function (isPushState, deleteSourceInfo, sameSite) {
      if (isPushState) sendOnLeave("" + lastPageId, true);
      lastPageId = uuid();
      page.id = lastPageId;

      var currentPage = definedHostname + getPath();

      sendData(
        assign(
          page,
          deleteSourceInfo
            ? {
                referrer: sameSite ? referrer : null,
              }
            : source,
          {
            https: loc.protocol == https,
            timezone: timezone,
            type: pageviewsText,
          }
        )
      );

      referrer = currentPage;
    };

    var pageview = function (isPushState, pathOverwrite) {
      // Obfuscate personal data in URL by dropping the search and hash
      var path = getPath(pathOverwrite);

      // Don't send the last path again (this could happen when pushState is used to change the path hash or search)
      if (!path || lastSendPath == path) return;

      lastSendPath = path;

      var data = {
        path: path,
        viewport_width:
          Math.max(documentElement[clientWidth] || 0, window.innerWidth || 0) ||
          null,
        viewport_height:
          Math.max(
            documentElement[clientHeight] || 0,
            window.innerHeight || 0
          ) || null,
      };

      if (nav[language]) data[language] = nav[language];

      if (screen) {
        data.screen_width = screen.width;
        data.screen_height = screen.height;
      }

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

      // Check if referrer is the same as current hostname
      var sameSite = referrer
        ? referrer.split(slash)[0] == definedHostname
        : false;

      // We set unique variable based on pushstate or back navigation, if no match we check the referrer
      data.unique = isPushState || userNavigated ? false : !sameSite;

      page = data;

      var triggerSendPageView = function () {
        fetchedHighEntropyValues = true;
        sendPageView(isPushState, isPushState || userNavigated, sameSite);
      };

      if (!fetchedHighEntropyValues) {
        // Request platform information if this is available
        try {
          if (uaData && isFunction(uaData.getHighEntropyValues)) {
            uaData
              .getHighEntropyValues([platformText, platformVersionText])
              .then(function (highEntropyValues) {
                payload.os_name = highEntropyValues[platformText];
                payload.os_version = highEntropyValues[platformVersionText];
                triggerSendPageView();
              })
              .catch(triggerSendPageView);
          } else {
            triggerSendPageView();
          }
        } catch (e) {
          triggerSendPageView();
        }
      } else {
        triggerSendPageView();
      }
    };

    /////////////////////
    // AUTOMATED PAGE VIEW COLLECTION
    //

    var his = window.history;
    var hisPushState = his ? his.pushState : undefinedVar;

    // Overwrite history pushState function to
    // allow listening on the pushState event
    if (autoCollect && hisPushState && Event && dis) {
      var stateListener = function (type) {
        var orig = his[type];
        return function () {
          var arg = arguments;
          var rv = orig.apply(this, arg);
          var event;
          if (typeof Event == "function") {
            event = new Event(type);
          } else {
            // Fix for IE
            event = doc.createEvent("Event");
            event.initEvent(type, true, true);
          }
          event.arguments = arg;
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

    // When in hash mode, we record a pageview based on the onhashchange function
    if (autoCollect && mode == "hash" && "onhashchange" in window) {
      addEventListenerFunc(
        "hashchange",
        function () {
          pageview(1);
        },
        false
      );
    }

    if (autoCollect) pageview();
    else
      window.sa_pageview = function (path) {
        pageview(0, path);
      };

    /////////////////////
    // EVENTS
    //

    var sessionId = uuid();
    var validTypes = ["string", "number"];

    var sendEvent = function (event, callbackRaw) {
      var eventIsFunction = isFunction(event);
      var callback = isFunction(callbackRaw) ? callbackRaw : function () {};

      if (validTypes.indexOf(typeof event) < 0 && !eventIsFunction) {
        warn("event is not a string: " + event);
        return callback();
      }

      try {
        if (eventIsFunction) {
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
          assign(source, bot ? { bot: true } : {}, {
            type: "event",
            event: event,
            page_id: page.id,
            session_id: sessionId,
          }),
          callback
        );
    };

    var defaultEventFunc = function (event, callback) {
      sendEvent(event, callback);
    };

    // Set default function if user didn't define a function
    if (!window[functionName]) window[functionName] = defaultEventFunc;

    var eventFunc = window[functionName];

    // Read queue of the user defined function
    var queue = eventFunc && eventFunc.q ? eventFunc.q : [];

    // Overwrite user defined function
    window[functionName] = defaultEventFunc;

    // Post events from the queue of the user defined function
    for (var event in queue) sendEvent(queue[event]);
  } catch (e) {
    sendError(e);
  }
})(
  window,
  {"saGlobal":INSTALL_OPTIONS.sa_global,"mode":INSTALL_OPTIONS.hash_mode ? 'hash' : null,"collectDnt":INSTALL_OPTIONS.collect_dnt},
  INSTALL_OPTIONS.custom_domain || "queue.simpleanalyticscdn.com",
  "",
  "cloudflare_2",
  "sa_event"
);
