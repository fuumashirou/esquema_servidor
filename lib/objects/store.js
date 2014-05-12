exports.store = {
  attributes: {
    name:        ["String",   true],
    description: ["String",   true],
    address:     ["String",   true],
    web:         ["String",  false],
    facebook:    ["String",  false],
    twitter:     ["String",  false],
    city:        ["String",   true],
    phone:       ["String",  false],
    coordinates: ["Array",   false],
    category:    ["String",   true],
    time_zone:   ["String",   true],
    verified:    ["Boolean",  true],
    active:      ["Boolean", false],
    deleted:     ["Boolean", false]
  },
  select: { name:1, description:1, address:1, phone:1, city:1, hidden:1, created_at:1, updated_at:1 },
  whitelist: ["name","description","address","web","facebook","twitter","city","phone","coordinates","category","time_zone","schedule", "happy_hour", "hidden"]
}
