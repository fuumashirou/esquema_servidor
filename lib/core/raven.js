var raven  = require("raven")
  , config = require("./config").sentry;

exports.client = new raven.Client(config.dsn);
