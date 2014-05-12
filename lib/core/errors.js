var restify = require("restify")
  , config  = require("./config").warns
  , Raven   = require("./raven").client;

module.exports = ServerError = function(name, message) {
  this.errors = ["RestError",
                "BadDigestError",
                "BadMethodError",
                "InternalError",
                "InvalidArgumentError",
                "InvalidContentError",
                "InvalidCredentialsError",
                "InvalidHeaderError",
                "InvalidVersionError",
                "MissingParameterError",
                "NotAuthorizedError",
                "RequestExpiredError",
                "RequestThrottledError",
                "ResourceNotFoundError",
                "WrongAcceptError"];

  if (this.errors.indexOf(name) !== -1) {
    warn(message);
    return new restify[name](message);
  }
}

function warn(message) {
  switch(config.level) {
  case 0:
    false
    break;
  case 1:
    Raven.captureMessage(message)
    break;
  case 2:
    console.log(message)
    break;
  }
}
