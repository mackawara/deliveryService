const nodemailer = require("nodemailer");
const mailer = async (req, res, next) => {
  const transporter = nodemailer.createTransport({
    host: "smtp-mail.outlook.com", //replace with your email provider
    port: 587,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS,
    },
  });
  console.log(process.env.PASS);
  // verify if nodemailer is authorized to send emails from that address.
  transporter.verify(function (error, success, next) {
    if (error) {
      console.log(error);
    } else {
      console.log("transorter has verified and is ready to send messages");
    }
  });

  // this middleware configures the dat for saving to the DB

  //input validation using Express validato

  const sender = process.env.EMAIL;
  const receiver = process.env.RECEIVER;
  const mail = {
    from: sender,
    to: receiver,
    subject: "booking",
    text: ` ${req.body.email}`,
  };

  transporter.sendMail(mail, (err, res) => {
    console.log(sender, receiver);
    if (err) {
      console.error(err);
      // res.status(500).send("Something went wrong.");
    } else {
      console.log(`email has been sent succesfully to ${receiver}`);
      next();
    }
  });
};
module.exports = mailer;
