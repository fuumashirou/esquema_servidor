# API-Server:

## Requerimientos:

* API:
Interfaz de programación de aplicaciones. Ss el conjunto de funciones y procedimientos (o métodos, en la programación orientada a objetos) que ofrece cierta biblioteca para ser utilizado por otro software como una capa de abstracción.

* JSON:
JSON, JavaScript Object Notation, es un formato ligero para el intercambio de datos. La simplicidad de JSON ha dado lugar a la generalización de su uso, especialmente como alternativa a XML en AJAX. Una de las supuestas ventajas de JSON sobre XML como formato de intercambio de datos en este contexto es que es mucho más sencillo escribir un analizador sintáctico (parser) de JSON.

## Tecnologías a usar:

* [Node.js](http://nodejs.org/):
Es un entorno de programación en la capa del servidor basado en el lenguaje de programación Javascript, con I/O de datos en una arquitectura orientada a eventos, y basado en el motor de Google Javascript V8. [DOCS](http://nodejs.org/api/).

* [Restify](http://mcavage.github.com/node-restify/):
Framework de programación para Node.js. maneja solicitudes HTTP de manera asincrónica. [DOCS](http://mcavage.github.com/node-restify/).

* [MongoDB](http://www.mongodb.org/):
Es un sistema de base de datos NoSQL orientado a documentos. En vez de guardar los datos en tablas como se hace en las base de datos relacionales, MongoDB guarda estructuras de datos en documentos tipo JSON con un esquema dinámico, haciendo que la integración de los datos en ciertas aplicaciones sea mas fácil y rápida. [DOCS](http://www.mongodb.org/display/DOCS/Home).

* [Socket.io](http://socket.io/):

* [Redis](http://redis.io/):

Servidor de la aplicación móvil Twable

# Documentacion

## Registrar nuevo usuario

Solicitud:

  Metodo: POST
  Body: "number=56994967994&device=iPhone"
  URI: /users/register
  Parametro opcional: ?method=sms (desactivado por defecto)

Respuesta: (development)

  {"token":"020035"}

Respuesta SMS: (production)

  HTTP: { code: 200, message: "Registration successful" }
  SMS: "Twable verification code 020035";

## Verificar nuevo usuario

Solicitud:

  Metodo: PUT
  Body: "number=56994967994&token=020035&device=iPhone"
  URI: /users/verify

Respuesta:

  { code: 200, message: "fd41fd5cfd3efd7e23fdfdfd2c3dc4fd2b62fd47fd00157a01137ffdfdfd39fdfd6504507ffdfdfdfdfdfd415e75e2fef34ae04ac9ed7d36d44949ffca19" }

## Mostrar ciudades

Solicitud:

  Metodo: GET
  URI: /cities

Respuesta:

  [
    "Concepción",
    "Fondo de Bikini"
  ]

## Mostrar locales

Solicitud:

  Metodo: GET
  URI: /stores
  Parametros opcionales: ?city=ciudad (/stores?city=Mirkwood)

Respuesta:

  [{
    _id : "51410ce424f1e761a8000002"
    city : "Mirkwood"
    created_at : "2013-03-13T23:33:56.520Z"
    description : "Las burgers de Legolas"
    name : "Legolas's Burger"
    updated_at : "2013-03-13T23:37:25.490Z"
  },{
    _id : "50fe9ed272185159e0000001"
    city : "San Pedro"
    created_at : "2013-01-22T14:14:42.706Z"
    description : "oeaoeu"
    name : "Bar Zero"
    updated_at : "2013-03-21T03:45:44.124Z"
  }]

## Mostrar un local por id

Solicitud:

  Metodo: GET
  URI: /stores/:store_id

Respuesta:

  {
    _id : "51410ce424f1e761a8000002"
    city : "Mirkwood"
    created_at : "2013-03-13T23:33:56.520Z"
    description : "Las burgers de Legolas"
    name : "Legolas's Burger"
    updated_at : "2013-03-13T23:37:25.490Z"
  }

## Mostrar items de un local

Solicitud:

  Metodo: GET
  URI: /stores/:store_id/items
  Parametros opcionales: ?category=categoria (/items?category=Pisco)

Respuesta:

  [{
    _id : "51042bfe721851a159000001"
    description : "ron con coca cola"
    name : "Roncola"
    price : "2500"
    stock : true
    updated_at : "2013-04-08T17:10:56.915Z"
  },{
    _id : "512e4bac24f1e7355b000001"
    description : "tequila margarita"
    name : "Tequila Margarita"
    price : "4500.0"
    stock : true
  }]

## Mostrar items de un local por id

Solicitud:

  Metodo: GET
  URI: /stores/:store_id/items/:item_id

Respuesta:

  {
    _id : "51042bfe721851a159000001"
    description : "Ron pampero"
    name : "Ron"
    price : "2500"
    stock : true
    updated_at : "2013-04-08T17:10:56.915Z"
    alternatives: [{
            _id: "5201863cfd56aaac24000004",
            aditional_price: null,
            limit: 1,
            options: "cocacola,fanta",
            title: "Bebidas"
          }],
  }

## Mostrar categorías de ítems de un local

Solicitud:

  Metodo: GET
  URI: /stores/:store_id/categories

Respuesta:

  [{
    category: "Sin Alcohol",
    quantity: 2,
    type: "Tragos"
  },{
    category: "Hamburguesas",
    quantity: 1,
    type: "Comidas"
  }]

## Hacer checkin

Solicitud:

  Metodo: POST
  Basic Auth: "Authorization: Basic OTQ5Njc5OTQ6MTIzNDU2"
  Body: "qr=eyJzdG9yZSI6IjUwZmNiZDY0NzIxODUxOTg2MDAwMDAwOCIsImNvZGUiOiJP%0AOXQ3VWxnTkVaancxN0c3SGNnY0hMenV6Q2p2NHFaTU1mOE13VXJJUG00PVxu%0AIn0"
  URI /checkins
  Parametros: ?device=dispositivo (/checkins?device=iPhone)

Respuesta: (código checkin)

  { checkin: "519e4039915d179405000001", store: "50fcbd647218519860000008", auth_token: "3725dd8f1da0f9978c7ff8c18b586e6655975a11315edbfb3cb100c99c7ca213" }

## Verificar nuevos usuarios en un checkin

Solicitud:

  Metodo: POST
  URI Params: ?auth_token=fe64cf3903bdc3200c501da68b0aeb94b81eb680b738b158a877c432f218f7c7
  URI: /checkins/users/:user

Respuesta:

  { status: 200, message: "done" }

## Remover usuarios en un checkin

Solicitud:

  Metodo: DELETE
  URI Params: ?auth_token=fe64cf3903bdc3200c501da68b0aeb94b81eb680b738b158a877c432f218f7c7
  URI: /checkins/users/:user

Respuesta:

  { status: 200, message: "done" }

## Generar orden

Solicitud:

  Metodo: POST
  URI Params: ?auth_token=fe64cf3903bdc3200c501da68b0aeb94b81eb680b738b158a877c432f218f7c7
  URI: /checkins/orders

Body

  [{
    "id": "52350f7bbc39dd030800007e",
    "quantity": 2
  },{
    "id": "52352e7ebc39ddc8ef0000c7",
    "quantity": 2,
    "selections": [{
            "id": "52352e7ebc39ddc8ef0000c8",
            "items_ids":[
                  "52352e7ebc39ddc8ef0000c9",
                  "52352e7ebc39ddc8ef0000ca"
                  ]
             }]
  }]

Respuesta:

  [{
    "checkin_id": "520273b33781ce410b000001",
    "store_id": "51f5ce54e57e6ca2ee000002",
    "table_id": "51f5ce5ae57e6cf09c000005",
    "items": [{
                "_id": "51f9a66424f1e71495000015",
                "name": "Pisco Capel 35",
                "quantity": 2,
                "price": 3000
              },{
                "_id": "52013341fd56aad341000004",
                "name": "Baby",
                "quantity": 2,
                "price": 2000,
                "alternative": [{
                                "id": "5201863cfd56aaac24000004",
                                "options": "cocacola",
                                "limit": 1
                                }]
              }],
    "status": 0,
    "ordered_at": "2013-08-07T16:24:12.987Z",
    "ordered_by": "56994967994",
    "_id": "520274ac2da19e4f0b000002"
  }]

## Obtener todas las ordenes de un checkin

Solicitud:

  Metodo: GET
  URI Params: ?auth_token=fe64cf3903bdc3200c501da68b0aeb94b81eb680b738b158a877c432f218f7c7
  URI: /checkins/orders

Respuesta:

  [
      {
          "items": [
              {
                  "_id": "52013341fd56aad341000004",
                  "name": "Baby",
                  "quantity": 2,
                  "price": 2000,
                  "alternative": [
                      {
                          "id": "5201863cfd56aaac24000004",
                          "options": "cocacola",
                          "limit": 1
                      }
                  ]
              }
          ],
          "ordered_at": "2013-08-07T16:23:19.051Z",
          "ordered_by": "56994967994"
      },
      {
          "items": [
              {
                  "_id": "51f9a66424f1e71495000015",
                  "name": "Pisco Capel 35",
                  "quantity": 2,
                  "price": 3000
              },
              {
                  "_id": "52013341fd56aad341000004",
                  "name": "Baby",
                  "quantity": 2,
                  "price": 2000,
                  "alternative": [
                      {
                          "id": "5201863cfd56aaac24000004",
                          "options": "cocacola",
                          "limit": 1
                      }
                  ]
              }
          ],
          "ordered_at": "2013-08-07T16:24:12.987Z",
          "ordered_by": "56994967994"
      }
  ]

## Obtener informacion para pagar

Solicitud:

  Metodo: POST
  Body: payment_type=cash
  URI Params: ?&auth_token=fe64cf3903bdc3200c501da68b0aeb94b81eb680b738b158a877c432f218f7c7
  URI: /checkins/bill


Respuesta:

  {
    "items":[{
        "name":"Roncola",
        "quantity":34,
        "price":2500
      },{
        "name":"Tequila Margarita",
        "quantity":12,
        "price":4500
      }],
    "total":139000,
    "user":"94967994",
    "generated_at":"2013-05-23T23:14:21.908Z"
  }
