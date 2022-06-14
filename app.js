const express = require("express");
const dotenv = require("dotenv");

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
