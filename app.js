const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const multer = require("multer");

// server config
const app = express();
const PORT = process.env.PORT || 5000;

//app.use(dotenv);

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
const {validationRules, validate} = require("./middleware/validation");
app.use(bodyParser.json());
app.post("/booking", validationRules(),validate,(req, res) => {
  console.log(req.body);
  res.send(req.body);
});
