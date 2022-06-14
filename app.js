const express = require("express");
const dotenv = require("dotenv");

// server config
const app = express();
const PORT = process.env.PORT || 5007;

//app.use(dotenv);
app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("server listening");
});
app.get("/", (req, res) => {
  res.send(__dirname + "public/deliveryhome.html");
});
