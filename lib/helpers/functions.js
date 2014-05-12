exports.todayWeekName = function() {
  var today   = new Date();
  var weekday = new Array(7);
  weekday[0] = "sunday";
  weekday[1] = "monday";
  weekday[2] = "tuesday";
  weekday[3] = "wednesday";
  weekday[4] = "thursday";
  weekday[5] = "friday";
  weekday[6] = "saturday";

  return weekday[today.getDay()];
}

exports.addMinutes = function(date, minutes, epoch) {
  date = (epoch === undefined) ? (new Date(date.getTime() + minutes*60000)) : (+new Date(date.getTime() + minutes*60000));
  return date;
}

exports.midnight_to_time = function(seconds) {
  var datetime, now, current;
  datetime = new Date();
  now = datetime.getHours() < 12 ? "am" : "pm"
  datetime.setHours(0,0,0,0);
  datetime.setSeconds(datetime.getSeconds() + seconds);
  current = datetime.getHours() < 12 ? "am" : "pm"
  if (now == "pm" && current == "am")
    datetime.setSeconds(datetime.getSeconds() + 24*60*60); // +24h
  if (now == "am" && current == "pm")
    datetime.setSeconds(datetime.getSeconds() - 24*60*60); // -24h
  return datetime
}

exports.aditionalItemPrice = function(items_limit, aditional_price, items_number) {
  var item_limit = parseInt(items_limit)
    , aditional_price = parseFloat(aditional_price);

  if (item_limit !== 0 && item_limit < items_number) {
    if (aditional_price !== 0) {
      return ((items_number - item_limit) * aditional_price);
    } else {
      return "Too many items selected";
    }
  } else if (item_limit === 0 && aditional_price !== 0) {
    return (items_number * aditional_price);
  } else {
    return 0;
  }
}
