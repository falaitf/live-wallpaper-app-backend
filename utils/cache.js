const NodeCache = require("node-cache");

// 1 hour TTL (3600 seconds)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

module.exports = cache;
