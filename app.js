// Modules
var mongo      = require("mongodb").MongoClient
  , routes     = require("./lib/core/routes")
  , socket     = require("./lib/core/socket")
  , config     = require("./lib/core/config")
  , numCPUs    = require("os").cpus().length
  , socketio   = require("socket.io")
  , cluster    = require("cluster")
  , restify    = require("restify");
var mongoConf  = config.mongodb
  , serverConf = config.server;

// Cluster mode
if (process.env["NODE_ENV"] === "production" && cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", function(worker, code, signal) {
    console.log("worker " + worker.process.pid + " died");
  });
} else {
  // Connect to mongodb
  mongo.connect(mongoConf.url, function(mongoerr, mongodb) {
    if (mongoerr) return console.log(mongoerr);

    // Create node server
    var server = restify.createServer(serverConf.options);
    // Start websocket server
    socket(server, mongodb);
    // Define routes
    routes(server, mongodb);

    // Start listening
    if (process.env["NODE_ENV"] === "production") {
      // Start http server
      server.listen(serverConf.port, serverConf.host, function() {
        // TODO: Socket connection
        console.log("Server listening on " + serverConf.host + ":" + serverConf.port);
      });
      // Handle uncaught Exceptions
      process.on("uncaughtException", function(err) {
        console.log(err);
      });
    } else {
      // Start http server
      server.listen(serverConf.port, serverConf.host, function() {
        console.log("Server listening on " + serverConf.host + ":" + serverConf.port);
      });
    }
    // On Control+C: close mongodb, pg and node server
    process.on("SIGINT", function() {
      console.log("\nClosing server " + server.name);
      mongodb.close();
      process.exit();
    });
  });
}
