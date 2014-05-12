var Schema = require("jugglingdb").Schema
  , schema = new Schema("redis", { port: 6379 });

var Checkin = schema.define("Checkin", {
  id:           { type: String },
  table_id:     { type: String, index: true },
  table_number: { type: Number },
  store_id:     { type: String, index: true },
  arrive_at:    { type: Number, default: Date.now },
  leave_at:     { type: Number },
  users:        { type: String },
  bills:        { type: Number, default: 0 },
  moved_to:     { type: String }
});

var Account = schema.define("Account", {
  id:         { type: String },
  username:   { type: String },
  verified:   { type: Boolean, default: false },
  checked_at: { type: Number,  default: Date.now },
  checkin_id: { type: String, index: true },
  last_order: { type: Number },
  admin:      { type: Boolean, default: false }
});

var Waiter = schema.define("Waiter", {
  id:         { type: String },
  username:   { type: String },
  verified:   { type: Boolean, default: false },
  checked_at: { type: Number,  default: Date.now },
  store_id:   { type: String, index: true }
})

var Order = schema.define("Order", {
  id:           { type: String },
  store_id:     { type: String, index: true },
  checkin_id:   { type: String, index: true },
  table_number: { type: Number },
  ordered_at:   { type: Number,  default: Date.now },
  ordered_by:   { type: String },
  received:     { type: Boolean, default: false },
  done:         { type: Boolean, default: false }
});

var Item = schema.define("Item", {
  id:         { type: String },
  item_id:    { type: String },
  name:       { type: String },
  price:      { type: Number },
  quantity:   { type: Number },
  order_id:   { type: String, index: true },
  ordered_at: { type: Number,  default: Date.now },
  happy_hour: { type: Boolean, default: false },
  hh_price:   { type: Number },
  priority:   { type: Number,  default: 0 }
});

var Song = schema.define("Song", {
  id:           { type: String },
  song_id:      { type: String },
  artist:       { type: String },
  title:        { type: String },
  table_number: { type: Number },
  store_id:     { type: String, index: true },
  ordered_at:   { type: Number,  default: Date.now }
});

var Bill = schema.define("Bill", {
  id:            { type: String },
  table_number:  { type: Number },
  checkin_id:    { type: String, index: true },
  generated_by:  { type: String },
  generated_at:  { type: Number, default: Date.now },
  total:         { type: Number },
  payment_type:  { type: String },
  items:         { type: String },
  discount:      { type: Number, default: 0 }
});

// Associations
Checkin.hasMany(Account, { as: "accounts", foreignKey: "checkin_id" });
Order.hasMany(Item, { as: "items", foreignKey: "order_id" });

module.exports = {
  Checkin: Checkin,
  Account: Account,
  Waiter:  Waiter,
  Order:   Order,
  Item:    Item,
  Song:    Song,
  Bill:    Bill
}
