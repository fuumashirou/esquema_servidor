var redis  = require("redis").createClient()
  , funct  = require("./functions")
  , mongo  = require("mongodb")
  , async  = require("async");

var objectID = function(id) {
  var param = id || null;
  return mongo.ObjectID(param);
}

exports.removeUser = function(store_id, account, callback) {
  if (!account)
    return callback("Invalid data", null);

  var checkin_id = account.checkin_id;
  redis.hget("Store:" + store_id + ":User", account.username, function(err, current_token) {
    if (current_token) {
      redis.del("Store:" + store_id + ":User", account.username);
      redis.del("Account:" + current_token);
      redis.srem("i:Account:checkin_id:" + checkin_id, current_token);
      redis.srem("s:Account", current_token);
    }
    callback(null, { status: 200, message: "done" });
  });
}

exports.removeCheckinData = function(checkin, callback) {
  if (!checkin)
    return callback("No checkin data", null);
  var checkin_id = checkin.id;
  // TODO: Respaldar esta info de checkins por mesa (mongodb?)
  redis.srem("i:Checkin:table_id:" + checkin.table_id, checkin_id);
  redis.srem("i:Checkin:store_id:" + checkin.store_id, checkin_id);
  redis.srem("s:Checkin", checkin_id);
  var users = checkin.users.split(",");
  async.each(users, function(username, cb) {
    redis.hget("Store:" + checkin.store_id + ":User", username, function(err, current_token) {
      if (current_token) {
        redis.del("i:Account:checkin_id:" + checkin_id);
        redis.del("Store:" + checkin.store_id + ":User", username);
        redis.del("Account:" + current_token);
        // redis.del("Checkin:" + checkin_id);
        redis.srem("s:Account", current_token);
      }
      cb();
    });
  }, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { status: 200, message: "done" });
    }
  });
}

// Get happy hour info
exports.happyHour = function(collection, store_id, callback) {
    var query  = { _id: objectID(store_id) }
      , select = { "happy_hour":1 }
      , weekday    = funct.todayWeekName()
      , happy_hour = { active: false };

  collection.findOne(query, select, function(err, store) {
    if (store && store.happy_hour) {

      happy_hour["quantity"] = store.happy_hour.rules.quantity;
      happy_hour["personal"] = store.happy_hour.rules.personal;
      happy_hour["free_selection"] = store.happy_hour.rules.free_selection;

      if (store.happy_hour.active == true) {
        var status = store.happy_hour.schedules[weekday];
        if (status.active == true) {
          happy_hour.all_day = status.all_day;
          if (status.all_day == true) {
            happy_hour.active = true;
          } else {
            try {
              var start = funct.midnight_to_time(status.start_time)
                , end   = funct.midnight_to_time(status.end_time)
                , now   = new Date();
              happy_hour["start"] = start.toISOString();
              happy_hour["end"]   = end.toISOString();
            } catch(e) {
              callback("Wrong time format", null);
            }
            if (start <= now && now <= end) {
              happy_hour.active = true;
            }
          }
        }
      }
    }
    callback(null, happy_hour);
  });
}

exports.objectID = objectID;
