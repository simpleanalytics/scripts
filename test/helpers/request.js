const getPost = req => {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
  });
};

module.exports.getJSONBody = async req => {
  try {
    const body = await getPost(req);
    const json = JSON.parse(body);
    return Promise.resolve(json);
  } catch (err) {
    return Promise.reject(err);
  }
};
