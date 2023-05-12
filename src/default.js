/* eslint-env browser */

(function (
  window,
  overwriteOptions,
  baseUrl,
  apiUrlPrefix,
  version,
  defaultNamespace,
  sendError,
  warn
) {
  try {
    /////////////////////
    // PREDEFINED VARIABLES FOR BETTER MINIFICATION
    //

    // This seems like a lot of repetition, but it makes our script available for
    // multple destination which prevents us to need multiple scripts. The minified
    // version stays small.
    var undefinedVar = undefined;
    var trueVar = true;
    var falseVar = false;
    var trueText = "true";
    var https = "https:";
    var pageviewText = "pageview";
    var eventText = "event";
    /** if errorhandling **/
    var errorText = "error";
    /** endif **/
    var slash = "/";
    var protocol = https + "//";
    var con = window.console;
    var doNotTrack = "doNotTrack";
    var nav = window.navigator;
    var loc = window.location;
    var locationHostname = loc.host;
    var doc = window.document;
    var userAgent = nav.userAgent;
    var notSending = "Not sending request ";
    var notSendingWhen = notSending + "when ";
    var fetchedHighEntropyValues = falseVar;
    var encodeURIComponentFunc = encodeURIComponent;
    var decodeURIComponentFunc = decodeURIComponent;
    var stringify = JSON.stringify;
    var thousand = 1000;
    var addEventListenerFunc = window.addEventListener;
    var fullApiUrl = protocol + apiUrlPrefix + baseUrl;
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
    var docsUrl = "https://docs.simpleanalytics.com";
    var pages = 0;
    var isBotAgent =
      /(bot|spider|crawl)/i.test(userAgent) && !/(cubot)/i.test(userAgent);
    /** if screen **/
    var screen = window.screen;
    /** endif **/

    /** if skipnonwindow **/
    // Skip server side rendered pages on Cloudflare
    if (typeof window == "" + undefinedVar) return;
    /** endif **/

    // Find the script element where options can be set on
    var scriptElement =
      doc.currentScript || doc.querySelector('script[src*="' + baseUrl + '"]');

    /////////////////////
    // HELPER FUNCTIONS
    //

    // A simple log function so the user knows why a request is not being send
    warn = function () {
      // 1. Convert args to a normal array
      var args = [].slice.call(arguments);

      // 2. Prepend log prefix
      args.unshift("Simple Analytics:");

      // 3. Pass along arguments to console.warn
      // Function.prototype.apply.call is needed for Internet Explorer
      return Function.prototype.apply.call(con.warn, con, args);
    };

    var warnInFunction = function (name, error) {
      warn("Error in your " + name + " function:", error);
    };

    var hasProp = function (obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    };

    var isString = function (string) {
      return typeof string == "string";
    };

    var filterRegex = function (item) {
      return item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    var attr = function (scriptElement, attribute) {
      return scriptElement && scriptElement.getAttribute("data-" + attribute);
    };

    var convertCommaSeparatedToArray = function (csv) {
      return Array.isArray(csv)
        ? csv
        : isString(csv) && csv.length
        ? csv.split(/, ?/)
        : [];
    };

    var isObject = function (object) {
      return object && object.constructor === Object;
    };

    var assign = function () {
      var to = {};
      var arg = arguments;
      for (var index = 0; index < arg.length; index++) {
        var nextSource = arg[index];
        if (isObject(nextSource)) {
          for (var nextKey in nextSource) {
            if (hasProp(nextSource, nextKey)) {
              to[nextKey] = nextSource[nextKey];
            }
          }
        }
      }
      return to;
    };

    var settings = window.sa_settings;
    var logSettings = settings || Object.keys(overwriteOptions).length;

    // Merge overwriteOptions with sa_settings
    overwriteOptions = assign(overwriteOptions, settings);

    if (logSettings) warn("Settings", overwriteOptions);

    /** if ignoremetrics **/
    // Customers can skip data points
    var ignoreMetrics = convertCommaSeparatedToArray(
      overwriteOptions.ignoreMetrics || attr(scriptElement, "ignore-metrics")
    );
    /** endif **/

    var collectMetricByString = function (metricAbbreviation) {
      /** if ignoremetrics **/
      // Can't use Array.find() here because we need to support IE9
      return (
        ignoreMetrics.filter(function (item) {
          return new RegExp("^" + metricAbbreviation).test(item);
        }).length === 0
      );
      /** else **/
      return true;
      /** endif **/
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

    // Define namespace for the library
    var namespaceText = "namespace";
    var namespace =
      overwriteOptions[namespaceText] ||
      attr(scriptElement, namespaceText) ||
      defaultNamespace;

    /** if metadata **/
    var metadataObject = window[namespace + "_metadata"];
    var appendMetadata = function (metadata, data) {
      if (isObject(metadataObject)) metadata = assign(metadata, metadataObject);
      var metadataCollectorFunction = window[metadataCollector];
      if (!isFunction(metadataCollectorFunction)) return metadata;
      try {
        return assign(
          metadata,
          metadataCollectorFunction.call(window, assign(metadata, data))
        );
      } catch (error) {
        warnInFunction("metadata", error);
      }
    };
    /** endif **/

    var isBoolean = function (value) {
      return !!value === value;
    };

    // By default we allow source, medium in the URLs. With strictUtm enabled
    // we only allow it with the utm_ prefix: utm_source, utm_medium, ...
    var strictUtm =
      overwriteOptions.strictUtm ||
      attr(scriptElement, "strict-utm") == trueText;

    var getQueryParams = function (ignoreSource) {
      return (
        loc.search
          .slice(1)
          .split("&")
          .filter(function (keyValue) {
            var ignore = ignoreSource || !collectMetricByString("ut");

            /** if allowparams **/
            var paramsRegexList = allowParams.map(filterRegex).join("|");
            var regex = ignore
              ? "^(" + paramsRegexList + ")="
              : "^((utm_)" +
                (strictUtm ? "" : "?") +
                "(source|medium|content|term|campaign)" +
                (strictUtm ? "" : "|ref") +
                "|" +
                paramsRegexList +
                ")=";
            if (ignore && !allowParams.length) return falseVar;
            /** else **/
            if (ignore) return falseVar;
            var regex =
              "^((utm_)" +
              (strictUtm ? "" : "?") +
              "(source|medium|content|term|campaign)" +
              (strictUtm ? "" : "|ref") +
              ")=";
            /** endif **/

            // The prefix "utm_" is optional with "strictUtm" disabled
            // "ref" is only collected when "strictUtm" is disabled
            return new RegExp(regex).test(keyValue);
          })
          .join("&") || undefinedVar
      );
    };

    /** if ignorepages **/
    // Ignore pages specified in data-ignore-pages
    var shouldIgnore = function (path) {
      for (var i in ignorePages) {
        var ignorePageRaw = ignorePages[i];
        if (!ignorePageRaw) continue;

        // Prepend a slash when it's missing
        var ignorePage =
          ignorePageRaw[0] == slash ? ignorePageRaw : slash + ignorePageRaw;

        if (
          ignorePage === path ||
          new RegExp(
            "^" + filterRegex(ignorePage).replace(/\\\*/gi, "(.*)") + "$",
            "i"
          ).test(path)
        )
          return trueVar;
      }
      return falseVar;
    };
    /** endif **/

    /////////////////////
    // Warn when using script twice
    //

    // Only load our script once, customers can still send multiple page views
    // with the sa_pageview function if they turn off auto collect.
    var loadedVariable = namespace + "_loaded";
    if (window[loadedVariable] == trueVar) return warn(notSending + "twice");
    window.sa_event_loaded = trueVar;
    window[loadedVariable] = trueVar;

    /////////////////////
    // SEND DATA VIA OUR PIXEL
    //

    // Send data via image
    var sendData = function (data, callback, onlyThisData) {
      data = onlyThisData ? data : assign(payload, page, data);

      if (nav.brave && !onlyThisData) data.brave = trueVar;
      if (nav._duckduckgoloader_ && !onlyThisData) data.duck = trueVar;

      /** if dev **/
      data.dev = trueVar;
      /** endif **/

      var image = new Image();
      /** if events **/
      if (callback) {
        image.onerror = callback;
        image.onload = callback;
      }
      /** endif **/
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
          .join("&") +
        "&time=" +
        Date.now();
    };

    // Customers can overwrite their hostname, here we check for that
    var overwrittenHostname =
      overwriteOptions.hostname || attr(scriptElement, "hostname");
    var definedHostname = overwrittenHostname || locationHostname;

    var basePayload = {
      version: version,
      hostname: definedHostname,
    };

    /** if errorhandling **/
    /////////////////////
    // ERROR FUNCTIONS
    //

    // Send errors
    // no var because it's scoped outside of the try/catch
    sendError = function (errorOrMessage) {
      errorOrMessage = errorOrMessage.stack
        ? errorOrMessage + " " + errorOrMessage.stack
        : errorOrMessage;
      warn(errorOrMessage);
      sendData(
        assign(basePayload, {
          type: errorText,
          error: errorOrMessage,
          path: loc.pathname,
        }),
        undefinedVar,
        trueVar
      );
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
      falseVar
    );
    /** endif **/

    /////////////////////
    // INITIALIZE VALUES
    //

    /** if duration **/
    var start = now();
    /** endif **/

    /** if scroll **/
    var scrolled = 0;
    /** endif **/

    /////////////////////
    // GET SETTINGS
    //

    // Script mode, this can be hash mode for example
    var mode = overwriteOptions.mode || attr(scriptElement, "mode");

    /** if ignorednt **/
    // Should we record Do Not Track visits?
    var collectDnt = isBoolean(overwriteOptions.collectDnt)
      ? overwriteOptions.collectDnt
      : attr(scriptElement, "ignore-dnt") == trueText ||
        attr(scriptElement, "skip-dnt") == trueText ||
        attr(scriptElement, "collect-dnt") == trueText;
    /** endif **/

    /** if (or spa hash) **/
    // Some customers want to collect page views manually
    var autoCollect = !(
      attr(scriptElement, "auto-collect") == "false" ||
      overwriteOptions.autoCollect === falseVar
    );
    /** endif **/

    /** if events **/
    // Event function name
    var eventFunctionName =
      overwriteOptions.saGlobal ||
      attr(scriptElement, "sa-global") ||
      namespace + "_" + eventText;
    /** endif **/

    /** if ignorepages **/
    // Customers can ignore certain pages
    var ignorePages = convertCommaSeparatedToArray(
      overwriteOptions.ignorePages || attr(scriptElement, "ignore-pages")
    );
    /** endif **/

    /** if allowparams **/
    // Customers can allow params
    var allowParams = convertCommaSeparatedToArray(
      overwriteOptions.allowParams || attr(scriptElement, "allow-params")
    );
    /** endif **/

    /** if nonuniquehostnames **/
    // Customers can allow params
    var nonUniqueHostnames = convertCommaSeparatedToArray(
      overwriteOptions.nonUniqueHostnames ||
        attr(scriptElement, "non-unique-hostnames")
    );
    /** endif **/

    /** if pathoverwriter **/
    // Customers can overwrite certain values
    var pathOverwriter =
      overwriteOptions.pathOverwriter || attr(scriptElement, "path-overwriter");
    /** endif **/

    /** if metadata **/
    // Customers can add metadata to events and pageviews via a function
    var metadataCollector =
      overwriteOptions.metadataCollector ||
      attr(scriptElement, "metadata-collector");
    /** endif **/

    // This code could error on (incomplete) implementations, that's why we use try...catch
    var timezone;
    try {
      // c = countries
      timezone = collectMetricByString("c")
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefinedVar;
    } catch (error) {
      warn(error);
    }

    /////////////////////
    // PAYLOAD FOR BOTH PAGE VIEWS AND EVENTS
    //

    /** if botdetection **/
    var phantom = window.phantom;
    var bot =
      nav.webdriver ||
      window.__nightmare ||
      window.callPhantom ||
      window._phantom ||
      (phantom && !phantom) ||
      window.__polypane ||
      window._bot ||
      isBotAgent ||
      Math.random() == Math.random();
    /** else **/
    var bot = isBotAgent;
    /** endif **/

    // t = timeonpage, scro = scrolled
    var collectDataOnLeave =
      collectMetricByString("t") || collectMetricByString("scro");

    if (bot) basePayload.bot = trueVar;

    var payload = assign(basePayload, {
      // us = useragent
      ua: collectMetricByString("us") ? userAgent : undefinedVar,

      https: loc.protocol == https,
      timezone: timezone,
      page_id: collectDataOnLeave ? uuid() : undefinedVar,

      // se = sessions
      session_id: collectMetricByString("se") ? uuid() : undefinedVar,
    });

    /** if sri **/
    payload.sri = trueVar;
    /** else **/
    payload.sri = falseVar;
    /** endif **/

    // Use User-Agent Client Hints for better privacy
    // https://web.dev/user-agent-client-hints/
    if (uaData) {
      payload.mobile = uaData.mobile;
      payload.brands = stringify(uaData.brands);
    }

    /////////////////////
    // ADD WARNINGS
    //

    /** if dev **/
    warn("Using latest.dev.js, please change to latest.js on production.");
    /** endif **/

    /** if warnings **/
    // Warn when no document.doctype is defined (this breaks some documentElement dimensions)
    if (!doc.doctype) warn("Add DOCTYPE html for accurate dimensions");
    /** endif **/

    // When a customer overwrites the hostname, we need to know what the original
    // hostname was to hide that domain from referrer traffic
    if (definedHostname !== locationHostname)
      payload.hostname_original = locationHostname;

    // Don't track when Do Not Track is set to true
    /** if ignorednt **/
    if (!collectDnt && doNotTrack in nav && nav[doNotTrack] == "1")
      return warn(
        notSendingWhen + doNotTrack + " is enabled. See " + docsUrl + "/dnt"
      );
    /** else **/
    if (doNotTrack in nav && nav[doNotTrack] == "1")
      return warn(
        notSendingWhen + doNotTrack + " is enabled. See " + docsUrl + "/dnt"
      );
    /** endif **/

    // Warn when sending from localhost and not having a hostname set
    if (
      (locationHostname.indexOf(".") == -1 ||
        /^[0-9.:]+$/.test(locationHostname)) &&
      !overwrittenHostname
    )
      warn(
        "Set hostname on " +
          locationHostname +
          ". See " +
          docsUrl +
          "/overwrite-domain-name"
      );

    /////////////////////
    // SETUP INITIAL VARIABLES
    //

    var page = {};
    var lastSendPath;

    var getReferrer = function () {
      return (
        (doc.referrer || "")
          .replace(locationHostname, definedHostname)
          .replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/, "$4")
          .replace(/^([^/]+)$/, "$1") || undefinedVar
      );
    };

    // We don't want to end up with sensitive data so we clean the referrer URL
    var referrer = getReferrer();

    /////////////////////
    // TIME ON PAGE AND SCROLLED LOGIC
    //

    // We don't put msHidden in if duration block, because it's used outside of that functionality
    var msHidden = 0;

    var sendOnLeave = function (id, push) {
      if (!collectDataOnLeave) return;

      var append = assign(basePayload, {
        type: "append",
        original_id: push ? id : payload.page_id,
      });

      /** if duration **/
      // t = timeonpage
      if (collectMetricByString("t")) {
        append.duration = Math.round((now() - start - msHidden) / thousand);
      }
      msHidden = 0;
      start = now();
      /** endif **/

      /** if scroll **/
      // scro = scrolled
      if (collectMetricByString("scro")) {
        append.scrolled = Math.max(0, scrolled, position());
      }
      /** endif **/

      if (push || !nav.sendBeacon) {
        // sendData will assign payload to request
        sendData(append, undefinedVar, trueVar);
      } else {
        nav.sendBeacon(fullApiUrl + "/append", stringify(append));
      }
    };

    /** if duration **/
    var hiddenStart;
    addEventListenerFunc(
      "visibilitychange",
      function () {
        if (doc.hidden) {
          if (!("on" + pagehide in window)) sendOnLeave();
          hiddenStart = now();
        } else msHidden += now() - hiddenStart;
      },
      falseVar
    );
    /** endif **/

    addEventListenerFunc(pagehide, sendOnLeave, falseVar);

    /** if scroll **/
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
        warn(error);
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
        falseVar
      );
    });
    /** endif **/

    /////////////////////
    // ACTUAL PAGE VIEW LOGIC
    //

    var getPath = function (overwrite) {
      var path = "";

      // decodeURIComponent can fail when having invalid characters
      // https://github.com/simpleanalytics/roadmap/issues/462
      try {
        path = overwrite || decodeURIComponentFunc(loc.pathname);
      } catch (error) {
        warn(error);
      }

      /** if pathoverwriter **/
      var pathOverwriterFunction = window[pathOverwriter];
      if (isFunction(pathOverwriterFunction)) {
        try {
          path = pathOverwriterFunction.call(window, { path: path }) || path;
        } catch (error) {
          warnInFunction("path", error);
        }
      }
      /** endif **/

      /** if ignorepages **/
      // Ignore pages specified in data-ignore-pages
      if (shouldIgnore(path)) {
        warn(notSendingWhen + "ignoring " + path);
        return;
      }
      /** endif **/

      /** if hash **/
      // Add hash to path when script is put in to hash mode
      if (mode == "hash" && loc.hash) path += loc.hash.split("?")[0];
      /** endif **/

      return path;
    };

    var previousReferrer;

    // Send page view and append data to it
    var sendPageView = function (
      isPushState,
      deleteSourceInfo,
      sameSite,
      metadata
    ) {
      if (isPushState) sendOnLeave("" + payload.page_id, trueVar);
      if (collectDataOnLeave) payload.page_id = uuid();

      var currentPage = definedHostname + getPath();

      sendData({
        id: payload.page_id,
        type: pageviewText,
        referrer: !deleteSourceInfo || sameSite ? referrer : null,
        query: getQueryParams(deleteSourceInfo),

        /** if metadata **/
        metadata: stringify(metadata),
        /** endif **/
      });

      previousReferrer = referrer;
      referrer = currentPage;

      pages++;
    };

    var sameSite, userNavigated;

    var pageview = function (isPushState, pathOverwrite, metadata) {
      // Obfuscate personal data in URL by dropping the search and hash
      var path = getPath(pathOverwrite);

      // Don't send the last path again (this could happen when pushState is used to change the path hash or search)
      if (!path || lastSendPath == path) return;

      lastSendPath = path;
      page.path = path;

      /** if screen **/
      // v = viewportsizes
      if (collectMetricByString("v")) {
        page.viewport_width =
          Math.max(documentElement[clientWidth] || 0, window.innerWidth || 0) ||
          null;
        page.viewport_height =
          Math.max(
            documentElement[clientHeight] || 0,
            window.innerHeight || 0
          ) || null;
      }
      /** endif **/

      // l = language
      if (collectMetricByString("l")) {
        if (nav[language]) page[language] = nav[language];
      }

      /** if screen **/
      // sc = screensizes
      if (screen && collectMetricByString("sc")) {
        page.screen_width = screen.width;
        page.screen_height = screen.height;
      }
      /** endif **/

      // If a user does refresh we need to delete the referrer because otherwise it count double
      var perf = window.performance;
      var navigationText = "navigation";

      // Check if back, forward or reload buttons are being used in modern browsers
      var performaceEntryType;
      try {
        performaceEntryType = perf.getEntriesByType(navigationText)[0].type;
      } catch (error) {
        warn(error);
      }

      userNavigated = performaceEntryType
        ? ["reload", "back_forward"].indexOf(performaceEntryType) > -1
        : // Check if back, forward or reload buttons are being use in older browsers
          // 1: TYPE_RELOAD, 2: TYPE_BACK_FORWARD
          perf &&
          perf[navigationText] &&
          [1, 2].indexOf(perf[navigationText].type) > -1;

      // Check if referrer is the same as current real hostname (not the defined hostname!)
      /** if nonuniquehostnames **/
      var currentReferrerHostname = referrer
        ? referrer.split(slash)[0]
        : undefinedVar;
      sameSite = referrer
        ? nonUniqueHostnames.indexOf(currentReferrerHostname) > -1 ||
          currentReferrerHostname == locationHostname
        : falseVar;
      /** else **/
      sameSite = referrer
        ? referrer.split(slash)[0] == locationHostname
        : falseVar;
      /** endif **/

      /** if uniques **/
      // We set unique variable based on pushstate or back navigation, if no match we check the referrer
      page.unique = isPushState || userNavigated ? falseVar : !sameSite;
      /** endif **/

      /** if metadata **/
      metadata = appendMetadata(metadata, {
        type: pageviewText,
        path: page.path,
      });
      /** endif **/

      var triggerSendPageView = function () {
        fetchedHighEntropyValues = trueVar;
        sendPageView(
          isPushState,
          isPushState || userNavigated || !collectMetricByString("r"), // r = referrers
          sameSite,
          metadata
        );
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

    /** if spa **/
    /////////////////////
    // AUTOMATED PAGE VIEW COLLECTION
    //

    var his = window.history;
    var hisPushState = his ? his.pushState : undefinedVar;
    var dis = window.dispatchEvent;
    var pushStateText = "pushState";

    // Overwrite history pushState function to
    // allow listening on the pushState event
    if (autoCollect && hisPushState && Event && dis) {
      var stateListener = function (type) {
        var orig = his[type];
        return function () {
          var arg = arguments;
          var rv = orig.apply(this, arg);
          var event;
          if (isFunction(Event)) {
            event = new Event(type);
          } else {
            // Fix for IE
            // https://github.com/simpleanalytics/scripts/issues/8
            event = doc.createEvent("Event");
            event.initEvent(type, trueVar, trueVar);
          }
          event.arguments = arg;
          dis(event);
          return rv;
        };
      };

      his.pushState = stateListener(pushStateText);

      addEventListenerFunc(
        pushStateText,
        function () {
          pageview(1);
        },
        falseVar
      );

      addEventListenerFunc(
        "popstate",
        function () {
          pageview(1);
        },
        falseVar
      );
    }
    /** endif **/

    /** if hash **/
    // When in hash mode, we record a pageview based on the onhashchange function
    if (autoCollect && mode == "hash" && "onhashchange" in window) {
      addEventListenerFunc(
        "hashchange",
        function () {
          pageview(1);
        },
        falseVar
      );
    }
    /** endif **/

    /** if (or spa hash) **/
    if (autoCollect) pageview();
    else {
      /** if metadata **/
      window.sa_pageview = function (path, metadata) {
        pageview(0, path, metadata);
      };
      /** else **/
      window.sa_pageview = function (path) {
        pageview(0, path);
      };
      /** endif **/
    }
    /** else **/
    pageview();
    /** endif **/

    /** if events **/
    /////////////////////
    // EVENTS
    //

    var validTypes = ["string", "number"];

    var sendEvent = function (event, metadata, callbackRaw) {
      if (!callbackRaw && isFunction(metadata)) callbackRaw = metadata;

      var eventIsFunction = isFunction(event);
      var callback = isFunction(callbackRaw) ? callbackRaw : function () {};
      var eventType = typeof event;

      if (validTypes.indexOf(eventType) < 0 && !eventIsFunction) {
        warnInFunction(eventFunctionName, eventText + " can't be " + eventType);
        return callback();
      }

      try {
        if (eventIsFunction) {
          var eventOutput = event();
          if (validTypes.indexOf(typeof eventOutput) < 0) {
            warnInFunction(
              eventFunctionName,
              event + " returns no string: " + eventOutput
            );
            return callback();
          }
          event = eventOutput;
        }
      } catch (error) {
        warnInFunction(eventFunctionName, error);
        return callback();
      }

      event = ("" + event).replace(/[^a-z0-9]+/gi, "_").replace(/(^_|_$)/g, "");

      var eventParams = { type: eventText, event: event };
      var firstPage = !userNavigated && pages < 2;

      /** if metadata **/
      metadata = appendMetadata(metadata, eventParams);
      /** endif **/

      if (event) {
        sendData(
          assign(eventParams, {
            id: uuid(),
            query: getQueryParams(!firstPage),
            referrer:
              (firstPage || sameSite) && collectMetricByString("r")
                ? previousReferrer
                : null,

            /** if metadata **/
            metadata: stringify(metadata),
            /** endif **/
          }),
          callback
        );
      }
    };

    var defaultEventFunc = function (event, metadata, callback) {
      sendEvent(event, metadata, callback);
    };

    // Set default function if user didn't define a function
    if (!window[eventFunctionName])
      window[eventFunctionName] = defaultEventFunc;

    var eventFunc = window[eventFunctionName];

    // Read queue of the user defined function
    var queue = eventFunc && eventFunc.q ? eventFunc.q : [];

    // Overwrite user defined function
    window[eventFunctionName] = defaultEventFunc;

    // Post events from the queue of the user defined function
    for (var event in queue) {
      if (hasProp(queue, event)) {
        Array.isArray(queue[event])
          ? sendEvent.apply(null, queue[event])
          : sendEvent(queue[event]);
      }
    }
    /** endif **/
  } catch (e) {
    /** if errorhandling **/
    sendError(e);
    /** else **/
    warn(e);
    /** endif **/
  }
})(
  window,
  "{{overwriteOptions}}",
  "{{baseUrl}}",
  "{{apiUrlPrefix}}",
  "{{scriptName}}",
  "{{namespace}}"
);
