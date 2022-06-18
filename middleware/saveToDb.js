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

let saveToDb = async (req, res, next) => {
  console.log("attempting to save to database");
  const body = req.body;
  const senderName = req.body.senderName;
  const senderNumber = body.senderNumber;
  const typeOfParcel = req.body.typeOfParcel;
  const pickUpSlot = body.pickUpSlot;
  const departureLocation = body.departureLocation;
  const email = req.body.email;
  const receiverName = body.receiverName;
  const receiverNumber = req.body.receiverNumber;
  const destinationOfParcel = body.destinationOfParcel;

  /* takes the valid */
  const booking = new bookingModel({
    senderName: senderName,
    senderNumber: senderNumber,
    typeOfParcel: typeOfParcel,
    pickUpSlot: pickUpSlot,
    receiverNumber: receiverNumber,
    receiverName: receiverName,
    destinationOfParcel: destinationOfParcel,
    departureLocation: departureLocation,
    email: email,
  });

  saveBooking();
  async function saveBooking() {
    console.log(` now saving to DB `);
    await booking.save((err, booking) => {
      if (err) {
        const errors = err.errors;
        res.status(422).send(errors);
        return;
      } else {
        next();
        console.log("saving did not fail");
      }
    })
  }
}; //module.exports(booking)=booking
module.exports = saveToDb;
