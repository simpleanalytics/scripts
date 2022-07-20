const { expect } = require("chai");
const UUIDvalidate = require("uuid-validate");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const pageViewRequests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/simple.gif",
    body: { type: "pageview" },
  });

  expect(
    pageViewRequests,
    "There are not enough page views requests found"
  ).to.have.lengthOf(2);

  expect([true, "true"], "The first visit should be unique").to.include(
    pageViewRequests[0].body.unique
  );

  expect([false, "false"], "The second visit should not be unique").to.include(
    pageViewRequests[1].body.unique
  );

  expect(pageViewRequests[0].body.query, "Query should exist").to.equal(
    "project=project_x&utm_source=utm_source&medium=medium&ref=ref"
  );

  expect(pageViewRequests[1].body.query, "Query should not exist").to.equal(
    "project=project_x"
  );

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

    expect(request.body.version, "Version should exist").to.exist;

    expect(
      parseInt(request.body.version, 10),
      "Version should be a valid number"
    ).to.be.a("number");

    // We replace "https:" with "http:" string in server.js
    // that's why we expect local request to be https
    expect([true, "true"], "HTTPS should be a boolean").to.include(
      request.body.https
    );
  });
};
