var rConfig  = require("./config").redis
  , redis = require("redis");

// Redis server connection
var rediscli = redis.createClient(rConfig.port, rConfig.host, rConfig.options);

rediscli.on("error", function(err) {
  console.log("Redis error " + err);
});

rediscli.on("ready", function(a) {
  console.log("Redis connection established");
});

// Export clients
exports.rediscli = rediscli;
