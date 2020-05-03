module.exports.getPost = (req) => {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
  });
};

module.exports.getJSONBody = async (req) => {
  const body = await this.getPost(req);
  try {
    return JSON.parse(body);
  } catch (error) {
    return error;
  }
};
