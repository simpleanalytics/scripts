const { expect } = require("chai");
const { createDOM: createTrackerDOM } = require("./helpers/dom");
const { readFileSync } = require("fs");
const { runInContext, runInNewContext } = require("vm");

describe("auto-events", function () {
  // Runs auto-events.js on a single link and returns what the click sends
  function clickLink(href, { title, event = {} } = {}) {
    const calls = [];
    const navigations = [];
    const attributes = [];
    const listeners = [];
    const { hostname, pathname } = new URL(href);
    const link = {
      href,
      hostname,
      pathname,
      getAttribute(name) {
        return { href, title }[name] ?? null;
      },
      hasAttribute(name) {
        return this.getAttribute(name) !== null;
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

  it("keeps phone metadata when the title names the event", function () {
    const { calls } = clickLink("tel:+31201234567?extension=42", {
      title: "Call sales",
    });
    expect(calls.map(([name, metadata]) => ({ name, metadata }))).to.deep.equal(
      [
        {
          name: "phone_Call_sales",
          metadata: { title: "Call sales", phone: "+31201234567" },
        },
      ]
    );
  });

  for (const [href, name, metadata] of [
    [
      "https://example.org/path",
      "outbound_example_org",
      { url: "https://example.org/path" },
    ],
    [
      "https://example.com/file.pdf",
      "download_file_pdf",
      { url: "https://example.com/file.pdf" },
    ],
    [
      "mailto:test@example.com",
      "email_test_example_com",
      { email: "test@example.com" },
    ],
  ]) {
    it(`tracks clicks on ${href}`, function () {
      const { calls } = clickLink(href);
      expect(calls[0][0]).to.equal(name);
      expect(calls[0][1]).to.include(metadata);
    });
  }

  it("collects phone clicks by default without overriding cancelled navigation", function () {
    const { calls, navigations } = clickLink("tel:+31201234567", {
      event: { defaultPrevented: true },
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
      {
        event: {
          preventDefault() {
            prevented = true;
          },
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
    it(`sends events through the ${saGlobal} tracker function`, async function () {
      const dom = createTrackerDOM({
        settings: { autoCollect: false, ...settings },
      });
      const { document } = dom.window;
      const script = document.createElement("script");
      script.src = "auto-events.js";
      script.setAttribute("data-sa-global", saGlobal);
      document.head.appendChild(script);
      const link = document.createElement("a");
      link.href = "https://example.org/path";
      document.body.appendChild(link);
      runInContext(
        readFileSync("dist/latest/auto-events.js", "utf8"),
        dom.getInternalVMContext()
      );
      // auto-events.js binds links once the document is complete
      await new Promise((resolve) => setTimeout(resolve));
      // jsdom doesn't implement navigation
      document.addEventListener("click", (event) => event.preventDefault());

      link.click();

      expect(dom.window.saAutomatedLink).to.equal(undefined);

      expect(
        dom.sent.map((request) =>
          new URL(request.url).searchParams.get("event")
        )
      ).to.deep.equal(["outbound_example_org"]);
      dom.window.close();
    });
  }
});
