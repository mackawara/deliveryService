const mongoose = require("mongoose");

const { check } = require("express-validator");

const bookingSchema = new mongoose.Schema(
  {
    senderName: {
      type: String,
      required: true,
      minlength: [2, `please enter a valid name`],
      maxlength: [45, `please enter a valid name`],
      //match: [/^[a-z ,.'-]+$/ , " Name contains Invalid characters"],
    },
    recieverName: {
      type: String,
      required: true,
      minlength: [2, `please enter a valid name`],
      maxlength: [45, `please enter a valid name`],
      //match: [/^[a-z ,.'-]+$/ , " Name contains Invalid characters"],
    },

    typeOfParcel: {
      type: String,
      required: true,
      trim: true,
    },
    pickUpSlot: {
      type: String,
      required: true,
      trim: true,
    },
    departureLocation: {
      type: String,
      required: true,
      trim: true,
    },
    destinationOfParcel: {
      type: String,
      required: true,
      trim: true,
    },

    senderNumber: {
      type: String,
      required: true,
    },
    receiverNumber: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          check(v).isEmail;
        },
      },
    },
  },
  { timestamps: true }
);

const bookingModel = mongoose.model("booking", bookingSchema);

let saveBookingToDataBase = async (req, res, next) => {
  console.log("attempting to save to database");
  const senderName = req.body.senderName;
  const typeOfParcel = req.body.typeOfParcel;
  const bizDescription = req.body.bizDescription;
  const fbLink = req.body.fbLink;
  const senderNumber = req.body.senderNumber;
  const email = req.body.email;

  /* takes the valid */
  const booking = new bookingModel({
    senderName: senderName,
    typeOfParcel: typeOfParcel,
    bizDescription: bizDescription,
    fbLink: fbLink,
    senderNumber: senderNumber,
    email: email,
  });
  /* query booking queries the database to see if this is not a duplicate of existing entry */
  const querybooking = async function (response) {
    /* prevents duplicate from being recorded on db */
    console.log(`query booking is working`);

    const data = await bookingModel
      .exists({ senderName: senderName, email: email }) // check i there is any dat with the emeil
      .then((data) => {
        if (data) {
          console.log("entry is alredy found");
          console.log(data._id);
          res.status(409).send({
            message: `${senderName} is already entered thank you participation`,
          });
        } else if (!data) {
          /* if there is no existing entry the entry can be saved */
          savebooking();
        }
      })
      .catch((err) => {
        console.log(err);
      });
  };

  async function savebooking() {
    console.log(` now saving to DB `);
    await booking.save((err, booking) => {
      if (err) {
        const errors = err.errors;
        res.status(422).send(errors);
        return;
      } else next();
    });
  }
  querybooking();
}; //module.exports(booking)=booking
module.exports = saveToDB;
