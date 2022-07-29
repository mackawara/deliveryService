const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const multer = require("multer");
const axios = require("axios").default;

// server config
const app = express();
const PORT = process.env.PORT || 8000;

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
  res.sendFile(__dirname + "/public/deliveryhome.html");
});

app.get("/home", (req, res) => {
  console.log(__dirname + "/public/index.html");
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
Parcel should be picked up between : ${body.pickUpSlot} ${token} ${token}
     `;
  console.log(wAmsg);
  sendWatsp(wAmsg, admin);
  //console.log(response);
  res.send(JSON.stringify({ Booking: wAmsg }));
});

const sendWatsp = async (booking, number) => {
  console.log(booking, number, token, phoneID);
  axios({
    method: "POST", // Required, HTTP method, a string, e.g. POST, GET
    url:
      "https://graph.facebook.com/v13.0/" +
      phoneID +
      "/messages?access_token=" +
      token,
    data: {
      messaging_product: "whatsapp",
      to: number,
      text: { body: booking },
    },
    headers: { "Content-Type": "application/json" },
  })
    .then((data) => {
      console.log("success");
      return "Booking was saved , confirmation was also sent to your email";
    })
    .catch((err) => {
      return `There was an error on the server please try again `;
    });
};
// ACCEPT MESSAGES FROM WHATSAPP
app.post("/webhook",async (req, res) => {
  let body = req.body;

  // Check the Incoming webhook message
  console.log(JSON.stringify(req.body, null, 2));

  // info on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  /* if (req.body.object) {
    if (
      req.body.entry &&
      req.body.entry[0].changes &&
      req.body.entry[0].changes[0] &&
      req.body.entry[0].changes[0].value.messages &&
      req.body.entry[0].changes[0].value.messages[0]
    ) {
      console.log(req.body.object);
      let phoneID = req.body.entry[0].changes[0].value.metadata.phone_number_id;
      let from = req.body.entry[0].changes[0].value.messages[0].from; // extract the phone number from the webhook payload
      let msg_body = req.body.entry[0].changes[0].value.messages[0].text.body; // extract the message text from the webhook payload
      axios({
        method: "POST", // Required, HTTP method, a string, e.g. POST, GET
        url:
          "https://graph.facebook.com/v13.0/" +
          phoneID +
          "/messages?access_token=" +
          token,
        data: {
          messaging_product: "whatsapp",
          to: from,
          text: { body: "Ack: " + msg_body },
        },
        headers: { "Content-Type": "application/json" },
      });
    }
    res.sendStatus(200);
  } else {
    // Return a '404 Not Found' if event is not from a WhatsApp API
    res.sendStatus(404);
  }
   */if (body.message == "Booking") {
    console.log(body.message)
    witQUery(body.message);
  }
});
app.get("/webhook", (req, res) => {
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
/// WIT AI INTERFACE
const serverToken = process.env.WIT_SERVER_TOKEN;
const {Wit, log} = require('node-wit');
const client = new Wit({accessToken: serverToken});
client
  .message('How much is sendng a parcel', {})
  .then(witRes => {
    console.log('Yay, got Wit.ai response: ' + JSON.stringify(witRes));
  })
  .catch(console.error);
