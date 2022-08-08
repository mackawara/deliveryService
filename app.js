const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const multer = require("multer");
const axios = require("axios").default;

// server config
const app = express();

const PORT = process.env.PORT || 4400;

//app.use(gidotenv);

// mongoose configuration
/*  add try async await and try catch block to handle mongoDB ocnnection */
const mongoose = require("mongoose");

const { MongoClient } = require("mongodb");
require("dotenv").config();

const databaseName = "deliverybookings";
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbname: databaseName,
};
const uri =
  process.env
    .MONGODB_URI; /* process.env.MONGODB_URI || process.env.MONGOLAB_URI || process.env.MONGOLHQ_URI  */
/*
let connection = mongoose.connect(uri || process.env.DB_URI, options);
 
const database = mongoose.connection;
database.on("error", console.error.bind(console, "connection error:"));
database.once("open", async function () {
  //wait for db to connect before running server
  console.log(`DAtabase connection established  and checking`);
})
 */ app.listen(PORT, () => {
  console.log("server listening");
});
app.get("/", (req, res) => {
  console.log("/ was a request");
  res.sendFile(__dirname + "/public/deliveryhome.html");
});

app.get("/home", (req, res) => {
  console.log("home was requested");
  res.sendFile(__dirname + "/public/index.html");
});
app.get("/signup", (req, res) => {
  console.log(__dirname + "/public/signup.html");
  res.sendFile(__dirname + "/public/signup.html");
});
app.use(express.static("public"));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
//validation
const { validationRules, validate } = require("./middleware/validation");
const saveToDb = require("./middleware/saveToDb");
const mailer = require("./middleware/mailer");
app.use(bodyParser.json());

//Contact Number for Whatsapp
const admin = process.env.ADMIN_NUMBER;
const driver = process.env.DRIVER_NUMBER;
const token = process.env.TOKEN;
const phoneID = process.env.PHONE_ID;
const courage = process.env.COURAGE;
console.log(admin);
app.post("/booking", validationRules(), validate, async (req, res) => {
  const body = req.body;
  const wAmsg = `*Delivery Booking alert* \n
From sender : *${body.senderName}*, cell: ${body.senderNumber} \n
Pickup Location : *${body.departureLocation} * \n
To receiver :*${body.receiverName}*, cell: ${body.receiverNumber} \n
To Destination : ${body.destinationOfParcel} \n
Type of Parcel: *${body.parcel}* \n
Parcel should be picked up between : ${body.pickUpSlot}
     `;
  console.log(wAmsg);
  sendWatsp(wAmsg, admin);
  //console.log(response);
  res.send(JSON.stringify({ Booking: wAmsg }));
});

const sendWatsp = async (number, booking) => {
  console.log(booking, number);
  try {
    axios({
      method: "POST", // Required, HTTP method, a string, e.g. POST, GET
      url:
        "https://graph.facebook.com/v14.0/" +
        phoneID +
        "/messages?access_token=" +
        token,
      data: {
        messaging_product: "whatsapp",
        to: number,
        text: { body: booking },
      },
      headers: { "Content-Type": "application/json" },
    }).then((data) => {
      console.log(data);
      return "Booking was saved , confirmation was also sent to your email";
    });
  } catch (error) {
    console.log(`Thre was an error on the server please try again `);
  }
};
app.post("chatbot", async (req, res) => {
  console.log(req.body);
});
app.get("/watsapp", (req, res) => {
  console.log(req.body);
  /**
   * UPDATE YOUR VERIFY TOKEN
   *This will be the Verify Token value when you set up webhook
   **/
  const verify_token = process.env.VERIFY_TOKEN;

  // Parse params from the webhook verification request
  let mode = req.query["hub.mode"];
  let hookToken = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode were sent
  if (mode && hookToken) {
    // Check the mode and token sent are correct
    if (mode === "subscribe" && hookToken === verify_token) {
      // Respond with 200 OK and challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post("/watsapp", async (req, res) => {
  // Check the Incoming webhook message
  //console.log(JSON.stringify(req.body, null, 2));

  // info on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  if (req.body.object) {
    if (
      req.body.entry &&
      req.body.entry[0].changes &&
      req.body.entry[0].changes[0] &&
      req.body.entry[0].changes[0].value.messages &&
      req.body.entry[0].changes[0].value.messages[0]
    ) {
      console.log(req.body.object);
      let phone_number_id =
        req.body.entry[0].changes[0].value.metadata.phone_number_id;
      let from = req.body.entry[0].changes[0].value.messages[0].from; // extract the phone number from the webhook payload
      let msg_body = req.body.entry[0].changes[0].value.messages[0].text.body; // extract the message text from the webhook payload
     const reply= await executeQueries(projectId, sessionId, msg_body, languageCode); //take message and send to dialogflow
// test whethre webhook is receiving mesages
     sendWatsp(from,reply)
     sendWatsp(from,"testing webhook")
    }
    
    res.sendStatus(200);
  } else {
    // Return a '404 Not Found' if event is not from a WhatsApp API
    res.sendStatus(404);
  }
});
/// DIALGFLOW INTERFACE

/**
 * TODO(developer): UPDATE these variables before running the sample.
 */
// projectId: ID of the GCP project where Dialogflow agent is deployed
// const projectId = 'PROJECT_ID';
// sessionId: String representing a random number or hashed user identifier
// const sessionId = '123456';
// queries: A set of sequential queries to be send to Dialogflow agent for Intent Detection
// const queries = [
//   'Reserve a meeting room in Toronto office, there will be 5 of us',
//   'Next monday at 3pm for 1 hour, please', // Tell the bot when the meeting is taking place
//   'B'  // Rooms are defined on the Dialogflow agent, default options are A, B, or C
// ]
// languageCode: Indicates the language Dialogflow agent should use to detect intents
// const languageCode = 'en';

// Imports the Dialogflow library
const dialogflow = require("@google-cloud/dialogflow");

// Instantiates a session client
const sessionClient = new dialogflow.SessionsClient();
const projectId = process.env.PROJECT_ID;
const sessionId = `123456`;
const languageCode = "en";
const queries = [
  /*'I am Macdonald Kawara, I would like for my small box to be picked up form 24 Masasas park. My phone number is 0752314343',
  /* `My name is kaitani Tembo , I have a small bos at 14 ingagula hwange that I beed to be picked up`,
  */ `local booking`,
];

async function detectIntent(
  projectId,
  sessionId,
  query,
  contexts,
  languageCode
) {
  // The path to identify the agent that owns the created intent.
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  };
  //added contexts if they exist
  if (contexts && contexts.length > 0) {
    console.log(contexts);
    request.queryParams = {
      contexts: contexts,
    };
  }

  const responses = await sessionClient.detectIntent(request);
  return responses[0];
}

async function executeQueries(projectId, sessionId, query, languageCode) {
  // Keeping the context across queries let's us simulate an ongoing conversation with the bot
  console.log(projectId, sessionId);
  let context;
  let intentResponse;
  
    try {
      console.log(`Sending Query: ${query}`);
      intentResponse = await detectIntent(
        projectId,
        sessionId,
        query,
        context,
        languageCode
      );
      console.log("Detected intent");
      console.log(
        `Fulfillment Text: ${intentResponse.queryResult.fulfillmentText}`
      );

      // Use the context from this response for next queries
      context = intentResponse.queryResult.outputContexts;
    } catch (error) {
      console.log(error);
    }
    return intentResponse
  }

//executeQueries(projectId, sessionId, query, languageCode);
