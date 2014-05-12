var crypto  = require('crypto')
  , Hashids = require("hashids");

exports.createToken = function(data, secret_key) {
  var hmac  = crypto.createHmac("sha256", secret_key.toString());

  return hmac.update(data).digest("hex");
}

exports.createHash = function(length, type) {
  var type = type || "hex";

  return crypto.randomBytes(length).toString(type);
}

exports.encryptHash = function(int, salt, length) {
  var salt   = salt   || +new Date()
    , length = length || 8
    , hash   = new Hashids(salt.toString(), length);

  return hash.encrypt(parseInt(int));
}

// Decrypt QR code
exports.decodeQR = function(data, key) {
  var key = crypto.createHash('sha256').update(key, 'ascii').digest()
    , decipher = crypto.createDecipheriv('aes-256-cbc', key, '2518101481909809')
    , decrypt  = decipher.update(new Buffer(data, 'base64'));

  decrypt += decipher.final();
  return decrypt;
}

exports.encrypt = function (input, password, callback) {
    var m, key, iv;

    m = crypto.createHash('md5');
    m.update(password)
    key = m.digest('hex');

    m = crypto.createHash('md5');
    m.update(password + key)
    iv = m.digest('hex');

    // add padding
    while (input.length % 16 !== 0) {
      input += ' ';
    }

    var data      = new Buffer(input, 'utf8').toString('binary')
      , cipher    = crypto.createCipheriv('aes-256-cbc', key, iv.slice(0,16))
      , encrypted = cipher.update(data, 'binary') + cipher.final('binary')
      , encoded   = new Buffer(encrypted, 'binary').toString('hex');

    callback(encoded);
};

// Create numbers only token
exports.randomString = function(int, length) {
  var chars = "0123456789"
    , string_length = length || 6
    , randomstring  = '';

  for (var i = 0; i < string_length; i++) {
    var rnum = Math.floor(Math.random() * parseInt(int.toString().charAt(i)));
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
}
