var objects = require("../objects");

module.exports = parseSelect = function(object_name, attributes) {
  var object = objects[object_name];
  var type   = Object.keys(object)[0];
  if (attributes === undefined) return object[type].select;
  var attr_array  = attributes.toLowerCase().split(",");
  var parent_name = (object[type].parent !== undefined) ? object_name + "." : "";

  var valid_attr = {};
  for (var i = 0; i < attr_array.length; i++) {
    if (object[type].whitelist.indexOf(attr_array[i]) !== -1) {
        valid_attr[parent_name + attr_array[i]] = 1;
      }
  }
  if (Object.keys(valid_attr).length === 0) return object[type].select;
  else return valid_attr;
}
