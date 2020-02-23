const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const pageViewRequests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/simple.gif",
    body: { type: "pageview" }
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

  pageViewRequests.map(request => {
    expect(
      request,
      "There are no page view requests with body found"
    ).to.have.property("body");

    expect(
      request.body,
      "All required keys should be present"
    ).to.include.all.keys([
      "version",
      "hostname",
      "https",
      "width",
      "id",
      "path",
      "type",
      "unique",
      "time"
    ]);

    expect(
      parseInt(request.body.version, 10),
      "Version should be a valid number"
    ).to.be.a("number");

    // We replace "https:" with "http:" string in server.js
    // that's why we expect local request to be https
    expect([true, "true"], "HTTPS should be a boolean").to.include(
      request.body.https
    );

    expect(parseInt(request.body.time, 10), "Time should be a number").to.be.a(
      "number"
    );
  });
};