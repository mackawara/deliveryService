const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const multer = require("multer");

// server config
const app = express();
const PORT = process.env.PORT || 5000;

//app.use(dotenv);

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

let connection = mongoose.connect(uri || process.env.DB_URI, options);

const database = mongoose.connection;
database.on("error", console.error.bind(console, "connection error:"));
database.once("open", async function () {
  //wait for db to connect before running server
  console.log(`DAtabase connection established  and checking`);

  app.listen(PORT, () => {
    console.log("server listening");
  });
  app.get("/", (req, res) => {
    console.log(__dirname + "/public/deliveryhome.html");
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
  app.post(
    "/booking",
    validationRules(),
    validate,
    mailer,
    saveToDb,
    (req, res) => {
      console.log("booking successfully saved");
      res.send(req.body);
    }
  );
});
