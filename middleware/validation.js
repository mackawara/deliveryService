const { body, validationResult } = require("express-validator");
const validationRules = () => {
  return [
    body("email", "Please enter a valid email")
      .isEmail()
      .isLength({ min: 4 })
      .withMessage("Please enter a valid email")
      .normalizeEmail()
      .trim()
      .escape()
      .optional(),
    body("senderName")
      .not()
      .isEmpty()
      .withMessage("Please enter your name")
      .isLength({ min: 2, max: 35 })
      .withMessage("Please enter a valid name")
      .isAlpha("en-GB", { ignore: " -" })
      .withMessage("Please enter a valid name, (no numerals)")
      .trim()
      .escape(),
    body("receiverName")
      .not()
      .isEmpty()
      .withMessage("Please enter your name")
      .isLength({ min: 2, max: 35 })
      .withMessage("Please enter a valid name")
      .isAlpha("en-GB", { ignore: " -" })
      .withMessage("Please enter a valid name, (no numerals)")
      .trim()
      .escape(),
    //.isAlpha()

    body("senderNumber", "please enter a valid number")
      .not()
      .isEmpty()
      .isLength({ min: 10, max: 13 })
      .matches(/(\+263|0)7[7-8|1|3][0-9]{7}$/)
      .withMessage("Please enter a valid Zimbabwean mobile number")
      .trim()
      .escape(),
    body("receiverNumber", "please enter a valid number")
      .not()
      .isEmpty()
      .isLength({ min: 10, max: 13 })
      .matches(/(\+263|0)7[7-8|1|3][0-9]{7}$/)
      .withMessage("Please enter a valid Zimbabwean mobile number")
      .trim()
      .escape(),
    body("pickUpSlot", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("Please make a valid selection")
      .matches(/\b(1000-1130hrs|1400-1530hrs|1700-1830hrs)\b/)
      .withMessage("Please make a valid selection")
      .notEmpty()
      .trim()
      .escape(),
    body("typeOfParcel", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .matches(/\b(Box|Hardware|Cash|Groceries|Other|Envelope\/Document)\b/g)
      .notEmpty()
      .trim()
      .escape(),
    body("departureLocation", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .matches(
        /\b(Empumalanga|Ingagula|Lwendulu| Ngumija|Makwika|cindrella|cbdHub|madumabisa)\b/i
      )
      .withMessage("Please select from the given options")
      .notEmpty()
      .trim()
      .escape(),
    body("destinationOfParcel", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .matches(
        /\b(Empumalanga|Ingagula|Lwendulu| Ngumija|Makwika|cindrella|cbdHub|madumabisa)\b/i
      )
      .withMessage("Please select from the given options")
      .notEmpty()
      .trim()
      .escape(),
  ];
};
const validate = (req, res, next) => {
  console.log(req.body);
  const errors = validationResult(req);
  const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
    // Build your resulting errors however you want! String, object, whatever - it works!
    return `${param}: ${msg}`;
  };
  const result = errors.formatWith(errorFormatter);
  console.log(errors);

  //const result = validationResult(req).formatWith(errorFormatter);
  if (!result.isEmpty()) {
    res.status(422).send(errors.mapped());

    console.log(errors.mapped());
  } else {
    console.log("Validation passed");

    return next();
  }
};
module.exports = { validationRules, validate };
// validation still needs to be consolidated
