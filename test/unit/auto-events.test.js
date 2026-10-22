const { expect } = require("chai");
const { createDOM } = require("./helpers/dom-auto-events");
const { createDOM: createTrackerDOM } = require("./helpers/dom");
const { readFileSync } = require("fs");
const { runInContext, runInNewContext } = require("vm");

function setupDOM() {
  const events = [];
  const dom = createDOM({
    beforeRun(vm) {
      vm.sa_event = function (name, metadata, cb) {
        events.push({ name, metadata });
        if (typeof cb === "function") cb();
      };
      vm.sa_event_loaded = true;
    },
  });
  dom.events = events;
  return dom;
}

describe("auto-events", function () {
  it("keeps phone metadata when the title names the event", function () {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "tel:+31201234567?extension=42";
    link.title = "Call sales";

    dom.window.saAutomatedLink(link, "phone");

    expect(dom.events).to.deep.equal([
      {
        name: "phone_Call_sales",
        metadata: { title: "Call sales", phone: "+31201234567" },
      },
    ]);
    dom.window.close();
  });

  // Runs auto-events.js on a single link and returns what the click sends
  function clickLink(href, hostname, event) {
    const calls = [];
    const navigations = [];
    const attributes = [];
    const listeners = [];
    const link = {
      href,
      hostname,
      pathname: "/",
      getAttribute(name) {
        return name === "href" ? this.href : null;
      },
      hasAttribute() {
        return false;
      },
      setAttribute(name) {
        attributes.push(name);
      },
      addEventListener(type, listener) {
        listeners.push({ type, listener });
      },
    };
    const document = {
      readyState: "complete",
      currentScript: { dataset: {} },
      getElementsByTagName: () => [link],
      set location(value) {
        navigations.push(value);
      },
    };
    const window = {
      document,
      location: { hostname: "example.com" },
      sa_event_loaded: true,
      sa_event() {
        calls.push([...arguments]);
      },
    };
    runInNewContext(readFileSync("dist/latest/auto-events.js", "utf8"), {
      window,
      document,
      console,
    });
    for (const { listener } of listeners) listener.call(link, event);
    return { calls, navigations, attributes, listeners };
  }

  it("collects phone clicks by default without overriding cancelled navigation", function () {
    const { calls, navigations } = clickLink("tel:+31201234567", "", {
      defaultPrevented: true,
    });
    expect(calls.map(([name, metadata]) => ({ name, metadata }))).to.deep.equal(
      [
        {
          name: "phone_31201234567",
          metadata: { title: undefined, phone: "+31201234567" },
        },
      ]
    );
    expect(navigations).to.deep.equal([]);
  });

  it("sends outbound clicks with keepalive without cancelling the click", function () {
    let prevented = false;
    const { calls, navigations, attributes, listeners } = clickLink(
      "https://example.org/",
      "example.org",
      {
        preventDefault() {
          prevented = true;
        },
      }
    );
    expect(attributes).to.deep.equal([]);
    expect(listeners.map(({ type }) => type)).to.deep.equal(["click"]);
    expect(calls).to.have.length(1);
    expect(calls[0][0]).to.equal("outbound_example_org");
    expect(calls[0][3]).to.equal(true);
    expect(prevented).to.equal(false);
    expect(navigations).to.deep.equal([]);
  });

  for (const [settings, saGlobal] of [
    [{ namespace: "ba" }, "ba_event"],
    [{ saGlobal: "my_event" }, "my_event"],
  ]) {
    it(`sends events through the ${saGlobal} tracker function`, function () {
      const dom = createTrackerDOM({
        settings: { autoCollect: false, ...settings },
      });
      const script = dom.window.document.createElement("script");
      script.src = "auto-events.js";
      script.setAttribute("data-sa-global", saGlobal);
      dom.window.document.head.appendChild(script);
      runInContext(
        readFileSync("dist/latest/auto-events.js", "utf8"),
        dom.getInternalVMContext()
      );
      const link = dom.window.document.createElement("a");
      link.href = "https://example.org/path";

      dom.window.saAutomatedLink(link, "outbound");

      expect(
        dom.sent.map((request) =>
          new URL(request.url).searchParams.get("event")
        )
      ).to.deep.equal(["outbound_example_org"]);
      dom.window.close();
    });
  }

  it("tracks outbound link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "https://example.org/path";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "outbound");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "outbound_example_org" });
      expect(dom.events[0].metadata).to.include({ url: link.href });
      done();
    }, 0);
  });

  it("tracks download link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "https://example.com/file.pdf";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "download");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "download_file_pdf" });
      expect(dom.events[0].metadata).to.include({ url: link.href });
      done();
    }, 0);
  });

  it("tracks email link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "mailto:test@example.com";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "email");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "email_test_example_com" });
      expect(dom.events[0].metadata).to.include({ email: "test@example.com" });
      done();
    }, 0);
  });
});
