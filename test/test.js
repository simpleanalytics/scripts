const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async () => {
  expect(
    global.REQUESTS,
    "There should be requests recorded"
  ).to.have.lengthOf.at.least(3);

  const requests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/get.gif"
  });

  // console.log(JSON.stringify(global.REQUESTS, null, 2));

  expect(requests, "There are no required requests found").to.have.lengthOf(2);

  requests.map((request, index) => {
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
      "pageviews",
      "time"
    ]);

    expect(
      request.body.pageviews,
      `There should be 1 page view per request`
    ).to.have.lengthOf(1);

    expect(request.body.version, "Version should be a number").to.be.a(
      "number"
    );

    expect(request.body.https, "HTTPS should be a boolean").to.be.a("boolean");

    expect(request.body.time, "Time should be a number").to.be.a("number");

    expect(
      request.body.pageviews[0],
      index === 0
        ? "The first visit should be unique"
        : "The second visit should not be unique"
    ).to.have.property("unique", index === 0 ? true : false);
  });
};
