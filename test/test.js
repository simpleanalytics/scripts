const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async () => {
  expect(
    global.REQUESTS,
    "There should be requests recorded"
  ).to.have.lengthOf.at.least(3);

  const pageViewRequests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/simple.gif",
    body: { type: "pageview" }
  });

  const beaconRequests = getRequests(global.REQUESTS, {
    body: { type: "beacon" }
  });

  // console.log(JSON.stringify(global.REQUESTS, null, 2));
  // console.log(JSON.stringify(pageViewRequests, null, 2));

  expect(
    pageViewRequests,
    "There are not enough page views requests found"
  ).to.have.lengthOf(2);

  expect(
    beaconRequests,
    "There are not enough beacon requests found"
  ).to.have.lengthOf(2);

  pageViewRequests.map((request, index) => {
    expect(
      request,
      "There is no /v2/post request with body found"
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

    expect(
      [true, false, "true", "false"],
      "HTTPS should be a boolean"
    ).to.include(request.body.https);

    expect(parseInt(request.body.time, 10), "Time should be a number").to.be.a(
      "number"
    );

    expect(
      index === 0 ? [true, "true"] : [false, "false"],
      index === 0
        ? "The first visit should be unique"
        : "The second visit should not be unique"
    ).to.include(request.body.unique);
  });
};
