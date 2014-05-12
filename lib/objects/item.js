exports.item = {
  attributes: {
    name:        ["String",     true],
    description: ["String",     true],
    price:       ["BigDecimal", true],
    stock:       ["Boolean",   false],
    category:    ["String",     true]
  },
  select: { _id:1, name:1, description:1, price:1, hh_price:1, starred:1, hidden:1, has_selection:1, happy_hour:1 },
  whitelist: ["_id", "name", "description", "category", "price", "stock", "selections", "selection_items", "has_selection", "happy_hour", "hh_price"]
}
