var faye   = require("faye")
  , config = require("./config").faye;

exports.client = new faye.Client(config.url);
