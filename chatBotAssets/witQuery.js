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
const firstEntityResolvedValue = (entities, entity) => {
  console.log(entities, entity);
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

let entities, traits, intents;

const queryWit = async (message) => {
  const client = new Wit({ accessToken: serverToken });
  client
    .message(message)
    .then((witResp) => {
      const resp = witResp;
      console.log(resp);
      intents = intentExcrator(resp.intents);
      console.log(`This is the extracted intent ` + intents);
      entities = witResp.entities;
      const priceEnquiry = firstEntityResolvedValue(intents, "price_enquiry");
      console.log(priceEnquiry);
      traits = witResp.traits;
      console.log(
        `these are the entities ` + entities[`price_enquiry:price_enquiry`]
      );
      //console.log(`these are the intents `+intents[0].name)
      handleMessage(intents, entities, traits);
    })
    .catch(console.error);
};
const handleMessage = ({ intents, entities, traits }) => {
  console.log(`handle message entities: ` + entities);
  const priceEnquiry = firstEntityResolvedValue(
    entities,
    "price_enquiry:price_enquiry"
  );
  /* const dBooking = firstValue(intents, "delivery_booking");
  const sentiment = firstValue(traits, "wit$sentiment");
  const pEnq = firstValue(entities, `price_enquiry`);
   */ console.log(priceEnquiry);
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
