const serverToken = process.env.WIT_SERVER_TOKEN;
const { Wit, log } = require("node-wit");
/* const firstValue = (obj, key) => {
  // this fucntion extracts the first value
  const val =
    obj &&
    obj[key] &&
    Array.isArray(obj[key]) &&
    obj[key].length > 0 &&
    obj[key][0].value;
  if (!val) {
    return null;
  }
  return val;
}; */
//contains all the entiites on which the bo t has been trained
const entityArr = [
  "price_enquiry",
  "departureLocation",
  "destination",
  "booking",
  "wit/location",
  "query",
  "complaint",
];
const firstEntityResolvedValue = (entities, entity) => {
  //console.log(entities, entity);
  const val =
    entities &&
    entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].resolved &&
    entities[entity][0].resolved.values &&
    Array.isArray(entities[entity][0].resolved.values) &&
    entities[entity][0].resolved.values.length > 0 &&
    entities[entity][0].resolved.values[0];
  if (!val) {
    return null;
  }
  return val;
};

const intentExcrator = (intents) => {
  const intObj = intents[0];
  return intObj.name;
};
const entityExctractor = (entities) => {
  let extracted = {};
  for (const any in entities) {
    const entity = entities[any];
    const entityName = entity[0][`name`];
    const entityValue = entity[0][`value`];
    extracted[entityName] = entityValue;
  }
  return extracted;
};
let entities, traits, intents;

const queryWit = async (message) => {
  const client = new Wit({ accessToken: serverToken });
  client
    .message(message)
    .then((witResp) => {
      const resp = witResp;
      console.log(witResp);
      // console.log(resp.entities["booking:booking"][0][`name`]);
      intents = intentExcrator(resp.intents);
      console.log(intents);
      // console.log(`This is the extracted intent ` + intents);
      entitiesRaw = witResp.entities;
      const entities = entityExctractor(entitiesRaw);
      const priceEnquiry = firstEntityResolvedValue(intents, "price_enquiry");
      //console.log(priceEnquiry);
      traits = witResp.traits;
      /*  console.log(
        `these are the entities ` + entities[`price_enquiry:price_enquiry`]
      ); */
      //console.log(`these are the intents `+intents[0].name)
      handleMessage(intents, entities);
    })
    .catch(console.error);
};
const handleMessage = (intent, entities) => {
  const time = new Date();
  console.log(entities);
  console.log(intent);
  if (intent == "Delivery_Booking") {
    console.log(
      `Booking from ${entities.departureLocation} to ${entities.destination} \n
      Bookind Date: ${time.toLocaleDateString()} \n
      Booking time ${time.toLocaleTimeString()} \n
      Booking Expected by  `
    );
  }
  /* const dBooking = firstValue(intents, "delivery_booking");
  const sentiment = firstValue(traits, "wit$sentiment");
  const pEnq = firstValue(entities, `price_enquiry`);
   */
  /*  if (getJoke) {
      if (category) {
        const jokes = allJokes[category];
        console.log(jokes[Math.floor(Math.random() * jokes.length)]);
      } else {
        console.log(allJokes['default'][0]);
      }
    } else if (sentiment) {
      const reply = sentiment === 'positive' ? 'Glad you liked it.' : 'Hmm.';
      console.log(reply);
    } else if (greetings) {
      console.log("hey this is joke bot :)");
    } else {
      console.log("I can tell jokes! Say 'tell me a joke about tech'!");
    } */
};

module.exports = queryWit;
