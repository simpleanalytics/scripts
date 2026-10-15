const { expect } = require("chai");
const { createDOM } = require("./helpers/dom-auto-events");
const { readFileSync } = require("fs");
const { runInNewContext } = require("vm");

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
  it("collects phone clicks by default without overriding cancelled navigation", function () {
    const events = [];
    const navigations = [];
    let click;
    const link = {
      href: "tel:+31201234567",
      getAttribute(name) {
        return name === "href" ? this.href : null;
      },
      hasAttribute() {
        return false;
      },
      addEventListener(type, listener) {
        click = listener;
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
      sa_event(name, metadata, callback) {
        events.push({ name, metadata });
        callback();
      },
    };
    runInNewContext(readFileSync("dist/latest/auto-events.js", "utf8"), {
      window,
      document,
      console,
    });
    click.call(link, { defaultPrevented: true });
    expect(events).to.deep.equal([
      {
        name: "phone_31201234567",
        metadata: { title: undefined, phone: "+31201234567" },
      },
    ]);
    expect(navigations).to.deep.equal([]);
  });

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
