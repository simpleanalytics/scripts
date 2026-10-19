const { expect } = require("chai");
const { runInContext } = require("vm");
const { createDOM } = require("./helpers/dom");

describe("inline events", function () {
  const windows = [];
  const setup = (options = {}) => {
    const dom = createDOM({ settings: { autoCollect: false }, ...options });
    windows.push(dom.window);
    return dom;
  };
  const events = (dom) =>
    dom.sent
      .filter(
        (request) => new URL(request.url).searchParams.get("type") === "event"
      )
      .map((request) => {
        const params = new URL(request.url).searchParams;
        return {
          name: params.get("event"),
          metadata: JSON.parse(params.get("metadata")),
        };
      });
  const click = (dom, element, options = {}) => {
    const event = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ...options,
    });
    element.dispatchEvent(event);
    return event;
  };
  const submit = (dom, form, button) => {
    const event = new dom.window.SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: button,
    });
    form.dispatchEvent(event);
    return event;
  };

  afterEach(() => windows.splice(0).forEach((window) => window.close()));

  it("tracks nested clicks and new elements with current metadata", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose" data-simple-event-plan-name="pro"><span>Choose</span></button>';
    const button = dom.window.document.querySelector("button");
    click(dom, button.firstChild);
    button.setAttribute("data-simple-event", "upgrade");
    button.setAttribute("data-simple-event-plan-name", "enterprise");
    click(dom, button);
    expect(events(dom)).to.deep.equal([
      { name: "choose", metadata: { tag: "button", plan_name: "pro" } },
      { name: "upgrade", metadata: { tag: "button", plan_name: "enterprise" } },
    ]);
  });

  it("counts a label click once when the browser also clicks its control", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<div data-simple-event="plan_toggle"><label for="y">Yearly</label><input id="y" type="radio" name="plan"><label><input type="checkbox"> <span>Monthly</span></label></div>';
    const [forLabel, wrapLabel] = dom.window.document.querySelectorAll("label");
    click(dom, forLabel);
    click(dom, wrapLabel.querySelector("span"));
    expect(forLabel.control.checked).to.equal(true);
    expect(wrapLabel.control.checked).to.equal(true);
    expect(events(dom).map((event) => event.name)).to.deep.equal([
      "plan_toggle",
      "plan_toggle",
    ]);
  });

  it("uses the tag of the clicked label, or of its control when the label is untagged", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<div data-simple-event="outer"><label for="y">Yearly</label><input id="y" type="checkbox" data-simple-event="inner"></div><label for="z">Other</label><input id="z" type="checkbox" data-simple-event="control">';
    const [outerLabel, otherLabel] =
      dom.window.document.querySelectorAll("label");
    click(dom, outerLabel);
    click(dom, outerLabel.control);
    click(dom, otherLabel);
    expect(events(dom).map((event) => event.name)).to.deep.equal([
      "outer",
      "inner",
      "control",
    ]);
  });

  it("counts quick independent clicks, keyboard activation and cancelled label clicks", async function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<div data-simple-event="toggle"><label for="y">Yearly</label><input id="y" type="checkbox"><label><input type="checkbox"> Monthly</label><label><button type="button"><span>Go</span></button></label></div><label for="b" data-simple-event="go">Go</label><button id="b" type="button"><b data-simple-event="inner">Go</b></button>';
    const [label, wrapLabel] = dom.window.document.querySelectorAll("label");
    const buttonText = dom.window.document.querySelector("span");
    const input = label.control;
    click(dom, label);
    click(dom, label);
    input.click();
    label.click();
    click(dom, wrapLabel.control);
    click(dom, wrapLabel.control);
    click(dom, buttonText);
    click(dom, buttonText);
    dom.window.document.querySelector("[for=b]").click();
    dom.window.document.querySelector("b").click();
    expect(events(dom)).to.have.length(10);
    label.addEventListener("click", (event) => event.preventDefault());
    click(dom, label);
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.click();
    expect(events(dom)).to.have.length(12);
  });

  it("counts labels across shadow roots and slots once", function () {
    const dom = setup();
    const document = dom.window.document;
    document.body.innerHTML =
      '<div data-simple-event="shadow"></div><div data-simple-event="slotted"><span>Remember</span></div><div data-simple-event="icon"><label for="i"><span></span></label><input id="i" type="checkbox"></div>';
    const [shadow, slotted, icon] = document.querySelectorAll("div");
    const root = shadow.attachShadow({ mode: "open" });
    root.innerHTML =
      '<label for="c">Toggle</label><input id="c" type="checkbox">';
    slotted.attachShadow({ mode: "open" }).innerHTML =
      '<label><input type="checkbox"> <slot></slot></label>';
    const iconRoot = icon.querySelector("span").attachShadow({ mode: "open" });
    iconRoot.innerHTML = "<b>Icon</b>";
    click(dom, root.querySelector("label"), { composed: true });
    // Browsers forward a composed click, jsdom's doesn't leave the shadow root
    click(dom, root.querySelector("input"), { composed: true });
    click(dom, root.querySelector("input"), { composed: true });
    click(dom, slotted.firstChild, { composed: true });
    click(dom, slotted.shadowRoot.querySelector("input"), { composed: true });
    click(dom, iconRoot.firstChild, { composed: true });
    expect(events(dom).map((event) => event.name)).to.deep.equal([
      "shadow",
      "shadow",
      "slotted",
      "icon",
    ]);
  });

  it("skips the forwarded click when a custom control clicks its inner input", function () {
    const dom = setup();
    runInContext(
      'customElements.define("x-input", class extends HTMLElement { static formAssociated = true; });',
      dom.getInternalVMContext()
    );
    dom.window.document.body.innerHTML =
      '<div data-simple-event="outer"><label for="x">Toggle</label><x-input id="x" data-simple-event="inner"><form data-simple-event="signup"></form></x-input></div>';
    const host = dom.window.document.querySelector("x-input");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<input type="checkbox">';
    const form = host.querySelector("form");
    form.addEventListener("submit", (event) => event.preventDefault());
    host.addEventListener("click", (event) => {
      if (event.composedPath()[0] !== host) return;
      event.stopPropagation();
      form.requestSubmit();
      click(dom, root.firstChild, { composed: true });
    });
    click(dom, dom.window.document.querySelector("label"));
    click(dom, host);
    expect(events(dom).map((event) => event.name)).to.deep.equal([
      "outer",
      "signup",
      "signup",
      "inner",
    ]);
  });

  it("skips the forwarded click when its handlers send other events", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<div data-simple-event="toggle"><label for="c">Toggle</label><input id="c" type="checkbox"></div><form data-simple-event="signup"></form><button data-simple-event="other">Other</button><label data-simple-event="note">Note</label>';
    const document = dom.window.document;
    const form = document.querySelector("form");
    form.addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("c").addEventListener("click", () => {
      form.requestSubmit();
      document.querySelector("button").click();
      document.querySelector("[data-simple-event=note]").click();
    });
    click(dom, document.querySelector("label"));
    expect(events(dom).map((event) => event.name)).to.deep.equal([
      "toggle",
      "signup",
      "other",
      "note",
    ]);
  });

  it("leaves link behavior and modified clicks untouched", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<a href="/file.pdf" target="_blank" download data-simple-event="download">Download</a>';
    const link = dom.window.document.querySelector("a");
    const event = click(dom, link, { ctrlKey: true });
    expect(event.defaultPrevented).to.equal(false);
    expect(link.getAttribute("target")).to.equal("_blank");
    expect(link.hasAttribute("download")).to.equal(true);
    expect(link.hasAttribute("onclick")).to.equal(false);
    expect(events(dom)).to.have.length(1);
  });

  it("tracks SPA clicks without undoing cancellation, and ignores untagged elements", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<button data-simple-event="cancelled">Cancel</button><button>Other</button>';
    const buttons = dom.window.document.querySelectorAll("button");
    buttons[0].addEventListener("click", (event) => event.preventDefault());
    expect(click(dom, buttons[0]).defaultPrevented).to.equal(true);
    click(dom, buttons[1]);
    expect(events(dom)).to.have.length(1);
    expect(events(dom)[0].name).to.equal("cancelled");
  });

  it("uses the actual submitter and lets the browser submit the form", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<form data-simple-event="signup"><input name="email" value="private@example.test"><button formaction="/other">Join</button></form>';
    const form = dom.window.document.querySelector("form");
    const button = dom.window.document.querySelector("button");
    click(dom, form.querySelector("input"));
    const event = submit(dom, form, button);
    expect(event.defaultPrevented).to.equal(false);
    expect(button.getAttribute("formaction")).to.equal("/other");
    expect(events(dom)).to.deep.equal([
      { name: "signup", metadata: { tag: "form", button_text: "Join" } },
    ]);
  });

  it("tracks SPA form submissions without submitting the form itself", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<form data-simple-event="signup"><button>Join</button></form>';
    const form = dom.window.document.querySelector("form");
    form.addEventListener("submit", (event) => event.preventDefault());
    let submits = 0;
    form.submit = () => submits++;
    expect(submit(dom, form, form.firstChild).defaultPrevented).to.equal(true);
    expect(events(dom)).to.have.length(1);
    expect(submits).to.equal(0);
  });

  it("does not disable built-in events when the beta helper is installed", function () {
    const dom = setup({
      beforeRun(context) {
        context.document.head.innerHTML =
          '<script src="https://scripts.simpleanalyticscdn.com/inline-events.js"></script>';
      },
    });
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose">Choose</button>';
    click(dom, dom.window.document.querySelector("button"));
    expect(events(dom)).to.have.length(1);
  });

  it("uses the button label, trims it, and limits its length", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<form data-simple-event="signup"><button value="save">  Save changes  </button></form>';
    const form = dom.window.document.querySelector("form");
    const button = form.firstChild;
    submit(dom, form, button);
    expect(events(dom)[0].metadata.button_text).to.equal("Save changes");
    button.textContent = "x".repeat(5000);
    submit(dom, form, button);
    expect(events(dom)[1].metadata.button_text).to.equal("x".repeat(200));
  });

  it("keeps submit labels stable when button markup is reformatted", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<form data-simple-event="signup"><button>Save changes</button></form>';
    const form = dom.window.document.querySelector("form");
    const button = form.firstChild;
    submit(dom, form, button);
    button.innerHTML =
      "\n  <svg></svg>\n  <span>Save</span>\n  <span>changes</span>\n";
    submit(dom, form, button);
    expect(
      events(dom).map((event) => event.metadata.button_text)
    ).to.deep.equal(["Save changes", "Save changes"]);
  });

  it("uses submit input labels and leaves missing submitter text empty", function () {
    const dom = setup();
    dom.window.document.body.innerHTML =
      '<form data-simple-event="signup"><input name="email" value="private@example.test"><input type="submit" value="Join"></form>';
    const form = dom.window.document.querySelector("form");
    submit(dom, form, form.lastChild);
    expect(events(dom)[0].metadata.button_text).to.equal("Join");
    form.firstChild.focus();
    submit(dom, form);
    expect(events(dom)[1].metadata.button_text).to.equal("");
  });

  it("uses a keepalive GET for inline events", function () {
    const requests = [];
    const dom = setup();
    dom.window.fetch = (url, options) => {
      requests.push({ url, options });
      return Promise.resolve();
    };
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose">Choose</button>';
    click(dom, dom.window.document.querySelector("button"));
    expect(requests).to.have.length(1);
    expect(new URL(requests[0].url).searchParams.get("event")).to.equal(
      "choose"
    );
    expect(requests[0].options).to.include({
      keepalive: true,
      mode: "no-cors",
      credentials: "omit",
    });
    expect(requests[0].options.method).to.equal(undefined);
    expect(events(dom)).to.have.length(0);
  });

  it("falls back to the image when fetch fails", async function () {
    const dom = setup();
    dom.window.fetch = () => Promise.reject(new Error("blocked"));
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose">Choose</button>';
    click(dom, dom.window.document.querySelector("button"));
    await Promise.resolve();
    expect(events(dom)).to.have.length(1);
  });

  it("falls back when fetch throws synchronously", function () {
    const dom = setup();
    dom.window.fetch = () => {
      throw new Error("unsupported");
    };
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose">Choose</button>';
    click(dom, dom.window.document.querySelector("button"));
    expect(events(dom)).to.have.length(1);
  });

  it("uses the tracker namespace and global metadata", function () {
    const dom = setup({
      settings: { autoCollect: false, namespace: "other" },
      beforeRun(context) {
        runInContext('window.other_metadata = { source: "global" };', context);
      },
    });
    dom.window.document.body.innerHTML =
      '<button data-simple-event="choose">Choose</button>';
    click(dom, dom.window.document.querySelector("button"));
    expect(events(dom)[0].metadata).to.include({
      source: "global",
      tag: "button",
    });
  });

  it("only confirms 404s when opted in, and strips query strings and fragments", function () {
    const requests = [];
    const options = {
      url: "https://example.test/missing?secret=private#fragment",
      beforeRun(context) {
        context.document.body.innerHTML = "Page 404 not found";
        context.XMLHttpRequest = function () {
          this.open = (method, url) => requests.push({ method, url });
          this.send = () => {
            this.status = 404;
            this.onload();
          };
        };
      },
    };
    const off = setup(options);
    off.window.document.dispatchEvent(new off.window.Event("DOMContentLoaded"));
    expect(requests).to.have.length(0);
    const on = setup({
      ...options,
      settings: { autoCollect: false, detect404: true },
    });
    on.window.document.dispatchEvent(new on.window.Event("DOMContentLoaded"));
    expect(requests).to.have.length(1);
    expect(requests[0].method).to.equal("HEAD");
    expect(events(on)).to.deep.equal([
      {
        name: "page_404",
        metadata: { url: "https://example.test/missing", status: 404 },
      },
    ]);
  });

  it("supports the 404 script attribute after DOMContentLoaded", function () {
    const dom = setup({
      beforeRun(context) {
        context.document.head.innerHTML =
          '<script src="https://scripts.simpleanalyticscdn.com/latest.js" data-detect-404="true"></script>';
        context.document.body.innerHTML = "Page 404 not found";
        Object.defineProperty(context.document, "readyState", {
          value: "complete",
        });
        context.XMLHttpRequest = function () {
          this.open = () => {};
          this.send = () => {
            this.status = 404;
            this.onload();
          };
        };
      },
    });
    expect(events(dom)).to.have.length(1);
    expect(events(dom)[0].name).to.equal("page_404");
  });

  it("does not report a successful HEAD response as a 404", function () {
    const dom = setup({
      settings: { autoCollect: false, detect404: true },
      beforeRun(context) {
        context.document.body.innerHTML = "An article about 404 errors";
        context.XMLHttpRequest = function () {
          this.open = () => {};
          this.send = () => {
            this.status = 200;
            this.onload();
          };
        };
      },
    });
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    expect(events(dom)).to.have.length(0);
  });

  it("does not issue HEAD requests for 404 in HTML attributes", function () {
    let requests = 0;
    const dom = setup({
      settings: { autoCollect: false, detect404: true },
      beforeRun(context) {
        context.document.head.innerHTML =
          '<script src="/assets/main-404abc.js"></script>';
        context.document.body.innerHTML =
          '<div style="width: 404px" class="w-404" data-id="404">A normal page</div>';
        context.XMLHttpRequest = function () {
          requests++;
        };
      },
    });
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    expect(requests).to.equal(0);
  });
});
