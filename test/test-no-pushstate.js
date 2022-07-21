const { expect } = require("chai");
const UUIDvalidate = require("uuid-validate");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const pageViewRequests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/simple.gif",
    body: { type: "pageview" },
  });

  console.log(JSON.stringify(pageViewRequests, null, 2));

  expect(
    pageViewRequests,
    "There are not enough page views requests found"
  ).to.have.lengthOf(2);

  expect(
    pageViewRequests[0].body.unique,
    "The first visit should be unique"
  ).to.equal("true");

  expect(
    pageViewRequests[1].body.unique,
    "The second visit should not be unique"
  ).to.equal("false");

  pageViewRequests.map((request) => {
    expect(
      request,
      "There are no page view requests with body found"
    ).to.have.property("body");

    expect(
      request.body,
      "All required keys should be present"
    ).to.include.all.keys([
      "hostname",
      "https",
      "id",
      "id",
      "path",
      "screen_height",
      "screen_width",
      "type",
      "unique",
      "version",
      "viewport_height",
      "viewport_width",
    ]);

    expect(UUIDvalidate(request.body.id, 4), "id should be a valid UUIDv4").to
      .be.true;

    expect(
      parseInt(request.body.version, 10),
      "Version should be a valid number"
    ).to.be.a("number");

    // We replace "https:" with "http:" string on CI
    expect(request.body.https, "HTTPS should be a boolean").to.equal("false");
  });
};
