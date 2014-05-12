var date = require("datejs");

function Time() {
  var first_day = Date.today().moveToDayOfWeek(0, -1);

  this.firstDay = function() {
    return first_day;
  }

  this.toDate = function(minutes) {
    return new Date(first_day.addMinutes(minutes));
  }

  this.toMinutes = function(date) {
    return Math.round((first_day - date) / (1000*60))
  }

}

