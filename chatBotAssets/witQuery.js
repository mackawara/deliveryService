const serverToken = process.env.WIT_SERVER_TOKEN;
const { Wit, log } = require("node-wit");

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
//exctracts the intent from the  wit response object
const intentExcrator = (intents) => {
  const intObj = intents[0];
  return intObj.name;
};
//exctracts the entities from the wit resp object and returns the entity and the resolved value
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
    .then((resp) => {
      console.log(resp);
      intents = intentExcrator(resp.intents);
      console.log(intents);
      entitiesRaw = resp.entities;
      const entities = entityExctractor(entitiesRaw);

      traits = resp.traits;
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
  if (intent == "Delivery_Booking") { //attempt to create a string from the extracted 
    console.log(
      `Please confirm if the following details are correct
      Booking from ${entities.departureLocation} to ${entities.destination} \n
      Bookind Date: ${time.toLocaleDateString()} \n
      Booking time ${time.toLocaleTimeString()} \n
      Booking Expected by  `
    );
  }
};

module.exports = queryWit;

//Use the intent to judge what the use wants
/* 
use the entities and the resolved values to deetermine the exact details
MVP
Take a delivery booking via whatsapp mmessage/facebook page/mesenger platform
Option 1
use stepped process eg Telone Chommie
Option 2 
use NLP processing to extract data from free form messsage
Option 3 
use guided message e.g use regex to check if all properties are therre
key messages

*/