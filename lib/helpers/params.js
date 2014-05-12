exports.notPresent = function() {
  var array = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] === null || arguments[i] === undefined || (typeof arguments[i] === "object" && (arguments[i].length === 0 || arguments[i].length === null))) {
      array.push(arguments[i]);
    }
  }

  if (array.length === 0) {
    return false;
  } else {
    return true;
  }
}
