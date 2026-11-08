(function saAutomatedEvents(window) {
  // Skip server side rendered pages. Without a window the call at the bottom
  // passes false: typeof is then "undefined", which sorts after "u".
  if (!window) return;

  var log = function (message, type) {
    var logger = type === "warn" ? console.warn : console.info;
    return logger && logger("Simple Analytics auto events:", message);
  };

  var doc = window.document;

  var scriptElement =
    doc.currentScript || doc.querySelector('script[src*="auto-events.js"]');

  var setting = function (attribute, type, defaultValue) {
    var value = scriptElement && scriptElement.dataset[attribute];

    // Booleans
    if (type === "bool" && (value === "true" || value === "false"))
      return value === "true";
    else if (type === "bool") return defaultValue;

    // Arrays
    if (type === "array" && value)
      return value
        .split(",")
        .map(function (item) {
          return item.trim();
        })
        .filter(Boolean);
    else if (type === "array") return defaultValue;

    return value || defaultValue;
  };

  var collectTypes = setting("collect", "array", [
    "outbound",
    "emails",
    "downloads",
    "phones",
  ]);
  var fullUrls = setting("fullUrls", "bool", false);

  var options = {
    // What to collect
    outbound: collectTypes.indexOf("outbound") > -1,
    emails: collectTypes.indexOf("emails") > -1,
    downloads: collectTypes.indexOf("downloads") > -1,
    phones: collectTypes.indexOf("phones") > -1,
    // Downloads: enter file extensions you want to collect
    downloadsExtensions: setting("extensions", "array", [
      "pdf",
      "csv",
      "docx",
      "xlsx",
      "zip",
      "doc",
      "xls",
    ]),

    // All: use title attribute if set for event name (for all events)
    // THIS TAKES PRECEDENCE OVER OTHER SETTINGS BELOW
    title: setting("useTitle", "bool", true),
    // Outbound: use full URL of the links? false for just the hostname
    outboundFullUrl: fullUrls,
    // Downloads: if taking event name from URL, use full URL or just filename (default)
    downloadsFullUrl: fullUrls,
  };

  var saGlobal = setting("saGlobal", "string", "sa_event");

  // For compiling the script
  var optionsLink = options;

  if (typeof optionsLink === "undefined")
    log("options object not found, please specify", "warn");

  function saAutomatedLink(element, type) {
    try {
      if (!element) return log("no element found");

      if (window[saGlobal] && window[saGlobal + "_loaded"]) {
        var hostname = element.hostname;
        var pathname = element.pathname;

        var event;
        var metadata = {
          title: element.getAttribute("title") || undefined,
        };
        var url = element.href || undefined;

        var useTitle = false;
        if (optionsLink.title && element.hasAttribute("title")) {
          var theTitle = element.getAttribute("title").trim();
          if (theTitle != "") useTitle = true;
        }

        if (!useTitle || type === "phone") {
          switch (type) {
            case "outbound": {
              event = hostname + (optionsLink.outboundFullUrl ? pathname : "");
              metadata.url = url;
              break;
            }
            case "download": {
              event = optionsLink.downloadsFullUrl
                ? hostname + pathname
                : pathname.split("/").pop();
              metadata.url = url;
              break;
            }
            case "email": {
              var href = element.getAttribute("href");
              event = (href.split(":")[1] || "").split("?")[0];
              metadata.email = event;
              break;
            }
            case "phone": {
              var hrefPhone = element.getAttribute("href");
              event = (hrefPhone.split(":")[1] || "").split("?")[0];
              metadata.phone = event;
              break;
            }
          }
        }
        if (useTitle) event = theTitle;

        var clean =
          type +
          "_" +
          event.replace(/[^a-z0-9]+/gi, "_").replace(/(^_+|_+$)/g, "");

        window[saGlobal](clean, metadata, 0, true);

        log("collected " + clean);
      } else {
        log(saGlobal + " is not defined", "warn");
      }
    } catch (error) {
      log(error.message, "warn");
    }
  }

  function collectLink(link) {
    if (link.hasAttribute("data-simple-event")) return;
    var collect = false;

    // Collect download clicks
    if (
      optionsLink.downloads &&
      /^https?:\/\//i.test(link.href) &&
      new RegExp(
        "\\.(" + (optionsLink.downloadsExtensions || []).join("|") + ")$",
        "i"
      ).test(link.pathname)
    ) {
      collect = "download";

      // Collect outbound links clicks
    } else if (
      optionsLink.outbound &&
      /^https?:\/\//i.test(link.href) &&
      link.hostname !== window.location.hostname
    ) {
      collect = "outbound";

      // Collect email clicks
    } else if (optionsLink.emails && /^mailto:/i.test(link.href)) {
      collect = "email";

      // Collect telephone clicks
    } else if (optionsLink.phones && /^tel:/i.test(link.href)) {
      collect = "phone";
    }

    return collect;
  }

  // One listener on the document also sees links added after the page loaded.
  // Capture runs before the website's own handlers, so a handler that stops
  // the click doesn't stop collecting it.
  doc.addEventListener(
    "click",
    function (event) {
      try {
        var link = event.target;
        while (link && link.tagName !== "A") link = link.parentNode;

        // Skip links that don't have an href
        var collect = link && link.getAttribute("href") && collectLink(link);
        if (collect) saAutomatedLink(link, collect);
      } catch (error) {
        log(error.message, "warn");
      }
    },
    true
  );
})(typeof window < "u" && window);
