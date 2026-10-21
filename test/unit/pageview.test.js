const { expect } = require("chai");
const { readFileSync } = require("fs");
const { runInContext } = require("vm");
const { createDOM, SCRIPT_PATH } = require("./helpers/dom");

describe("pageview", function () {
  for (const [referrer, unique, sentReferrer] of [
    [
      "https://external.example/?__cf_chl_tk=challenge",
      true,
      "external.example/",
    ],
    [
      "https://external.example/?source=mail&__cf_chl_rt_tk=challenge",
      true,
      "external.example/",
    ],
    ["https://example.com/?__cf_chl_tk=challenge", true, null],
    ["https://example.com/?source=mail&__cf_chl_rt_tk=challenge", true, null],
    ["https://example.com/previous", false, "example.com/previous"],
    [
      "https://example.com/docs/__cf_workers",
      false,
      "example.com/docs/__cf_workers",
    ],
    ["https://example.com/?next=?__cf_chl_tk=challenge", true, null],
    ["https://example.com/#?__cf_chl_tk=challenge", true, null],
  ]) {
    it(`uses the simple Cloudflare marker for ${referrer}`, function () {
      const dom = createDOM({
        beforeRun(context) {
          Object.defineProperty(context.document, "referrer", {
            value: referrer,
          });
        },
      });
      const url = new URL(dom.sent[0].url);
      expect(url.searchParams.get("unique")).to.equal(String(unique));
      expect(url.searchParams.get("referrer")).to.equal(sentReferrer);
      dom.window.close();
    });
  }

  it("keeps a challenge referrer from another non-unique hostname non-unique", function () {
    const dom = createDOM({
      settings: {
        nonUniqueHostnames: "partner.example",
        referrer: "https://partner.example/?__cf_chl_tk=challenge",
      },
    });
    const url = new URL(dom.sent[0].url);
    expect(url.searchParams.get("unique")).to.equal("false");
    expect(url.searchParams.get("referrer")).to.equal("partner.example/");
    dom.window.close();
  });

  it("recognizes challenge arrivals in an overwritten referrer without sending it", function () {
    const dom = createDOM({
      settings: { referrer: "https://example.com/?__cf_chl_tk=challenge" },
    });
    const url = new URL(dom.sent[0].url);
    expect(url.searchParams.get("unique")).to.equal("true");
    expect(url.searchParams.get("referrer")).to.equal(null);
    dom.window.close();
  });

  for (const navigationType of ["reload", "back_forward"]) {
    it(`keeps ${navigationType} non-unique with a challenge referrer`, function () {
      const dom = createDOM({
        navigationType,
        settings: { referrer: "https://example.com/?__cf_chl_tk=challenge" },
      });
      const url = new URL(dom.sent[0].url);
      expect(url.searchParams.get("unique")).to.equal("false");
      dom.window.close();
    });
  }

  it("counts only the first pageview as unique after a challenge", function () {
    const dom = createDOM({
      settings: { referrer: "https://example.com/?__cf_chl_tk=challenge" },
    });
    dom.window.sa_pageview("/manual");
    dom.window.history.pushState({}, "", "/spa");
    const pageviews = dom.sent.filter(
      (request) => new URL(request.url).searchParams.get("type") === "pageview"
    );
    expect(
      pageviews.map((request) =>
        new URL(request.url).searchParams.get("unique")
      )
    ).to.deep.equal(["true", "false", "false"]);
    dom.window.close();
  });

  it("exposes the pageview function under its configured namespace", function () {
    const dom = createDOM({
      settings: { namespace: "ba", autoCollect: false },
    });
    expect(dom.window.ba_pageview).to.be.a("function");
    expect(dom.window.sa_pageview).to.equal(dom.window.ba_pageview);
    dom.window.sa_pageview("/legacy");
    dom.window.ba_pageview("/namespaced");
    const paths = dom.sent.map((request) =>
      new URL(request.url).searchParams.get("path")
    );
    expect(paths).to.deep.equal(["/legacy", "/namespaced"]);
    dom.window.close();
  });

  it("keeps a default manual tracker separate from an automatic namespaced tracker", function () {
    const dom = createDOM({
      beforeRun(context) {
        const script = context.document.createElement("script");
        script.setAttribute("data-auto-collect", "false");
        script.setAttribute("data-hostname", "primary.example.com");
        Object.defineProperty(context.document, "currentScript", {
          value: script,
        });
      },
    });
    const manualPageview = dom.window.sa_pageview;
    const script = dom.window.document.currentScript;
    script.setAttribute("data-auto-collect", "true");
    script.setAttribute("data-hostname", "secondary.example.com");
    script.setAttribute("data-namespace", "ba");
    runInContext(readFileSync(SCRIPT_PATH, "utf8"), dom.getInternalVMContext());
    expect(dom.window.sa_pageview).to.equal(manualPageview);
    dom.window.sa_pageview("/manual");
    dom.window.ba_pageview("/other");
    const hostnames = dom.sent
      .filter((request) => request.type === "image")
      .map((request) => new URL(request.url).searchParams.get("hostname"));
    expect(hostnames).to.deep.equal([
      "secondary.example.com",
      "primary.example.com",
      "secondary.example.com",
    ]);
    dom.window.close();
  });

  // Lets tests move the clock the script uses for time on page
  const withClock = (options = {}) => {
    const clock = { time: 1e12 };
    const dom = createDOM({
      ...options,
      beforeRun(context) {
        context.Date.now = () => clock.time;
      },
    });
    dom.clock = clock;
    return dom;
  };

  const setVisibility = (dom, state) => {
    Object.defineProperty(dom.window.document, "hidden", {
      configurable: true,
      value: state == "hidden",
    });
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
  };

  const appends = (dom) =>
    dom.sent
      .filter((r) => r.type === "beacon")
      .map((r) => JSON.parse(r.data).duration);

  it("sends visible time when hidden and the total after returning", function () {
    const dom = withClock();
    dom.clock.time += 3000;
    setVisibility(dom, "hidden");
    dom.clock.time += 60000;
    setVisibility(dom, "visible");
    dom.clock.time += 2000;
    setVisibility(dom, "hidden");
    expect(appends(dom)).to.deep.equal([3, 5]);
    dom.window.close();
  });

  it("falls back to a pixel when sendBeacon throws", function () {
    const dom = withClock();
    dom.window.navigator.sendBeacon = function () {
      throw new TypeError("Illegal invocation");
    };
    dom.clock.time += 2000;
    setVisibility(dom, "hidden");
    const append = dom.sent.find(
      (r) => r.type === "image" && /type=append/.test(r.url)
    );
    expect(append, "append gif request").to.exist;
    expect(new URL(append.url).searchParams.get("duration")).to.equal("2");
    dom.window.close();
  });

  it("sends pageview, event and beacon requests", function (done) {
    const dom = withClock({ navigationType: "reload" });
    dom.clock.time += 2000;

    dom.window.sa_event("unit_test");
    setVisibility(dom, "hidden");

    setTimeout(() => {
      const gif = dom.sent.find(
        (r) => r.type === "image" && /simple\.gif/.test(r.url)
      );
      const eventReq = dom.sent.find(
        (r) => r.type === "image" && /event=unit_test/.test(r.url)
      );
      const beacon = dom.sent.find((r) => r.type === "beacon");

      expect(gif, "pageview gif request").to.exist;
      expect(eventReq, "event gif request").to.exist;
      expect(beacon, "append beacon request").to.exist;
      expect(beacon.url).to.match(/\/append$/);
      expect(beacon.data).to.include('"type":"append"');

      done();
    }, 10);
  });
});
