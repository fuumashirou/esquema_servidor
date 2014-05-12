(function() {
  var environment = process.env["NODE_ENV"] || "development";

  var config = {
    development: {
      server: {
        host: "0.0.0.0",
        port: 4000,
        options: { name: "Twable" }
      },
      mongodb: {
        url: "mongodb://localhost:27017/twable",
        options: { auto_reconnect: true, poolSize: 4 }
      },
      redis: {
        host: "localhost",
        port: 6379,
        options: {}
      },
      sentry: {
        dsn: "https://cd585076098d4b66830f37fba09487ba:ec4c521d67b246589fa229ffc24ffd29@app.getsentry.com/11852"
      },
      faye: {
        url: "http://localhost:9292/server"
      },
      warns: {
        level: 2
      }
    },
    production: {
      server: {
        host: "localhost",
        port: 4000,
        options: { name: "Twable" }
      },
      mongodb: {
        url: "mongodb://localhost:27017/twable",
        options: { auto_reconnect: true, poolSize: 4 }
      },
      redis: {
        host: "localhost",
        port: 6379,
        options: {}
      },
      sentry: {
        dsn: "https://d495a93e92dc4a00b60d1f29a1fce789:716e96044b9d485d98aef072af18145b@app.getsentry.com/8073"
      },
      faye: {
        url: "http://faye.twable.com/server"
      },
      warns: {
        level: 1
      }
    }
  }

    exports.server  = config[environment]["server"];
    exports.mongodb = config[environment]["mongodb"];
    exports.redis   = config[environment]["redis"];
    exports.sentry  = config[environment]["sentry"];
    exports.faye    = config[environment]["faye"];
    exports.warns   = config[environment]["warns"];
}).call(this);
