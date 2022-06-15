import { v4 as uuidv4 } from 'uuid';
import { Router } from 'itty-router'
import {
  json,
  missing,
  withContent,
} from 'itty-router-extras'

// database collection
import loki from 'lokijs'
let db = new loki('istrav');
let collection = db.addCollection('levels', { indices: ['id'] });

// for signing and verifying API keys
const secret = API_KEYS_SECRET || 'between workers'

// read from KV database
async function download(key, store) {
  let database = store || collection
  let storageData
  let recover = await ISTRAV.get(key)
  console.log('recover', recover)
  if (recover) {
    storageData = JSON.parse(recover)
    console.log('storageData', storageData)

    storageData.forEach((value) => {
      database.findAndRemove({ id: value.id }) // so we don't get duplicates
      delete value['$loki'] // otherwise we get record already there error
      database.insert(value)
    })
  }
  return storageData
}

// update to KV with in-memory records
async function save(key, store) {
  let database = store || collection
  let memoryData = database.find()
  console.log('memoryData', memoryData)
  let keep = JSON.stringify(memoryData)
  await ISTRAV.put(key, keep)
  return memoryData
}

// now let's create a router (note the lack of "new")
const router = Router()

// GET collection index
router.get('/:namespace/', async ({ params }) => {
  let key = `levels:${params.namespace}`

  // database
  await download(key)

  // list
  let records = collection.find()
  console.log('findAll', records)

  return handleRequest(records)
})

// GET item in collection
router.get('/:namespace/:id', async ({ params }) => {
  let key = `levels:${params.namespace}`

  // database
  await download(key)

  // read
  let record = collection.findOne({ id: params.id })

  return handleRequest(record)
})

// POST create item in the collection
router.post('/:namespace', withContent, async ({ params, content}) => {
  let key = `levels:${params.namespace}`

  // database
  await download(key)

  // create
  content.id = uuidv4()
  // content.amount
  // content.number
  // content.activeUsersPerHour
  // content.requestsPerDay
  // content.requestsPerMonth
  // content.name
  // content.description
  // content.stripeProductRef
  // content.stripePriceRef
  console.log('create', content)
  
  // submit
  let record = collection.insert(content)

  // database
  await save(key)

  return handleRequest(record)
})

// UPDATE existing item in the collection
router.put('/:namespace/:id', withContent, async ({ params, content}) => {
  let key = `levels:${params.namespace}`

  // database
  await download(key, collection)
  await download('namespaces', namespaces)

  // fetch
  let record = collection.findOne({ id: params.id })
  console.log('fetch', record)
  if (!record) {
    return handleRequest({ error: 'An access key with that id does not exist.' }, { status: 404 });
  }

  // update
  record.token = content.token || record.token
  record.number = content.number || record.number
  record.activeUsersPerHour = content.activeUsersPerHour || record.activeUsersPerHour
  record.requestsPerDay = content.requestsPerDay || record.requestsPerDay
  record.requestsPerMonth = content.requestsPerMonth || record.requestsPerMonth
  record.name = content.name || record.name
  record.description = content.description || record.description
  record.stripeProductRef = content.token || record.stripeProductRef
  record.stripePriceRef = content.stripePriceRef || record.stripePriceRef
  console.log('update', record)
  
  // submit
  collection.update(record)

  // database
  await save(key)

  return handleRequest(record)
})

// DELETE an item from collection
router.delete('/:namespace/:id', async ({ params }) => {
  let key = `levels:${params.namespace}`

  // database
  await download(key)

  // submit
  collection.findAndRemove({ id: params.id })

  // database
  await save(key)

  return handleRequest(null)
})

// 404 for everything else
router.all('*', () => new Response('Not Found.', { status: 404 }))

// attach the router "handle" to the event handler
addEventListener('fetch', event => {
  event.respondWith(router.handle(event.request))
})

// respond with a string and allow access control
async function handleRequest(content, options) {
  let dataString = JSON.stringify(content)
  return new Response(dataString, {
    ...options,
    headers:  {
      'content-type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
