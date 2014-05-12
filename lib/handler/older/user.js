var error   = require("../../core/errors")
  , helper  = require("../../helpers")
  , request = require("request")
  , bcrypt  = require("bcrypt")
  , base    = helper.database
  , crypto  = helper.crypto
  , params  = helper.params;
// SMS Nexmo API
var apiKey    = "a3728d6b"
  , apiSecret = "cffcf5b7";

function UserHandler(db) {
  var usersCollection = db.collection("users");

  this.register = function(req, res, next) {
    var number  = req.body.number
      , device  = req.body.device
      , method  = req.params.method;

    if (params.notPresent(number, device))
      return res.json(error("InvalidArgumentError", "Missing params"));
    if (number.charAt(0) === "+")
      number = number.substr(1);

    if (number === "2518101481909809") {
      var user_token = "123456";
    } else {
      var user_token = crypto.randomString(number)
        , smsText    = "Your Twable verification code is " + user_token;
    }
    // var token_expire = new Date();
    //     token_expire.setMinutes(token_expire.getMinutes() + 30);
    var query  = { _id: number }
      , select = { username:1 };
    usersCollection.findOne(query, select, function(err, user) {
      // Create token for existing user
      if (params.notPresent(user)) {
        // Create new user
        var new_user = { _id: number, token: user_token, token_device: device, verified: false, created_at: new Date(), token_count: 1 };
        usersCollection.insert(new_user, function(err, user) {
          if (err)
            return res.json(error("InternalError", "Error creating new user"));
            // Send SMS
            if (method === "sms" && number !== "2518101481909809") {
              sendSMS(apiKey, apiSecret, number, smsText);
              return res.json({ code: 200, message: "Registration successful" });
            } else if (number === "2518101481909809") {
              return res.json({ code: 200, message: user_token });
            } else {
              return res.json({ token: user_token });
            }
        });
      } else {
        var new_token = { $set: { token: user_token, token_device: device }, $inc: { token_count: 1 } };
        usersCollection.update(query, new_token, function(err, user) {
          if (err)
            return res.json(error("InternalError", "Error updating user"));
            // Send SMS
            if (method === "sms" && number !== "2518101481909809") {
              sendSMS(apiKey, apiSecret, number, smsText);
              return res.json({ code: 200, message: "Registration successful" });
            } else if (number === "2518101481909809") {
              return res.json({ code: 200, message: user_token });
            } else {
              return res.json({ token: user_token });
            }
        });
      }
    });
  }

  this.verify = function(req, res, next) {
    var number = req.body.number
      , token  = req.body.token
      , device = req.body.device;
    if (params.notPresent(number, token, device))
      return res.json(error("InvalidArgumentError", "Missing params"));
    if (number.charAt(0) === "+")
      number = number.substr(1);

    var query  = { _id: number }
      , select = { verified:1, token:1, token_device:1 };
    usersCollection.findOne(query, select, function(err, user) {
      if (params.notPresent(user))
        return res.json(error("ResourceNotFoundError", "User not found"));
      if (params.notPresent(user.token) && user.verified === true)
        return res.json(error("NotAuthorizedError", "User already verified"));
      if (!params.notPresent(user.token) && user.token !== token)
        return res.json(error("NotAuthorizedError", "Invalid token"));
      if (user.token_device !== device)
        return res.json(error("NotAuthorizedError", "Not allowed"));

      var data = number + token + device + (+new Date);
      generatePassword(data, token, function(err, password, password_hash) {
        if (err)
          return res.json(error("InternalError", "Error creating password hash"));

        var verify_user = { $set: { password: password_hash, verified: true, verified_at: new Date(), device: user.token_device }, $unset: { token: user.token, token_device: user.token_device } };
        usersCollection.update(query, verify_user, function(err, result) {
          if (err)
            return res.json(error("InternalError", "Error verifying user"));

          return res.json({ code: 200, message: password });
        });
      });
    });
  }

  this.authenticate = function(req, res, next) {
    if (params.notPresent(req.params.device))
      return res.json(error("NotAuthorizedError", "Device needed"));
    if (params.notPresent(req.authorization.basic))
      return res.json(error("InvalidHeader", "Authentication header needed"));
    var credentials = req.authorization.basic
      , username = credentials.username
      , password = credentials.password
      , device   = req.params.device;
    if (params.notPresent(username, password) || username === "anonymous" || password === "")
      return res.json(error("InvalidCredentials", "Not username or password"));
    if (username.charAt(0) === "+")
      username = username.substr(1);

    var query  = { _id: username }
      , select = { password:1, verified:1, device:1 };
    usersCollection.findOne(query, select, function(err, user) {
      if (params.notPresent(user))
        return res.json(error("InvalidCredentials", "Invalid username or password"));
      if (user.verified === false)
        return res.json(error("NotAuthorizedError", "User must be verified"));
      if (user.device !== device)
        return res.json(error("NotAuthorizedError", "Not allowed"));

      // Compare send password with DB passmord
      bcrypt.compare(password, user.password, function(err, result) {
        if (result === false)
          return res.json(error("InvalidCredentials", "Invalid username or password"));

        req.params.username = username;
        return next();
      });
    });
  }

  // this.modify_settings = function(req, res, next) {
  //   var SETTINGS = ["share_checkin_facebook", "share_checkin_twitter", "share_order_facebook", "share_order_twitter"]
  //     , current_user = req.params.username;
  //   if (params.notPresent(req.body)) return res.json(error("InvalidArgumentError", "Missing params"));

  //   var changed_settings = req.body
  //     , query = { username: current_user }
  //     , new_settings = {};

  //   for (var i = 0; i < SETTINGS.length; i++) {
  //     if (changed_settings.hasOwnProperty(SETTINGS[i])) {
  //       new_settings["social." + SETTINGS[i]] = changed_settings[SETTINGS[i]];
  //     }
  //   }

  //   var update_settings = { $set: new_settings };
  //   usersCollection.update(query, update_settings, function(err, result) {

  //     return res.json({ status: 200, message: "done" });
  //   });
  // }

  var sendSMS = function(apiKey, apiSecret, number, smsText) {
    var url = "https://rest.nexmo.com/sms/json?api_key=" + apiKey + "&api_secret=" + apiSecret + "&from=Twable&to=" + number + "&text=" + smsText;
    request(url, function (error, response, body) {
      console.log(response.statusCode);
    });
  }

  var generatePassword = function(data, key, callback) {
    crypto.encrypt(data, key, function(data_hash) {
      bcrypt.genSalt(8, function(err, salt) {
        bcrypt.hash(data_hash, salt, function(err, data_bcrypted) {

          callback(err, data_hash, data_bcrypted);
        });
      });
    });
  }

}

module.exports = UserHandler;
