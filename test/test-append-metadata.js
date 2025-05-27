const { expect } = require("chai");

describe("appendMetadata", function () {
  it("reloads sa_metadata each call", function () {
    const namespace = "sa";
    const window = {};

    const isObject = (obj) => obj && obj.constructor === Object;
    const assign = (target, source) => Object.assign(target, source);

    const appendMetadata = function (metadata, data) {
      const metadataObject = window[namespace + "_metadata"];
      if (isObject(metadataObject)) metadata = assign(metadata, metadataObject);
      return metadata;
    };

    window[namespace + "_metadata"] = { a: 1 };
    let metadata = appendMetadata({}, {});
    expect(metadata).to.deep.equal({ a: 1 });

    window[namespace + "_metadata"] = { b: 2 };
    metadata = appendMetadata({}, {});
    expect(metadata).to.deep.equal({ b: 2 });
  });
});
