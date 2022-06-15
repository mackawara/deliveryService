const { body, validationResult } = require("express-validator");
const validationRules = () => {
  return [
    body("email")
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
      .withMessage("Please ensure that your name is valid")
      // ignore is telling the code what to ignore
      .isAlpha("en-GB", { ignore: " -" })
      .withMessage("Please ensure that there are no numerals in your name")
      .trim()
      .escape(),
    body("receiverName")
      .not()
      .isEmpty()
      .withMessage("Please enter your name")
      .isLength({ min: 2, max: 35 })
      .withMessage("Please ensure that your name is valid")
      .isAlpha("en-GB", { ignore: " -" })
      .withMessage("Please ensure that there are no numerals in your name")
      .trim()
      .escape(),
    //.isAlpha()

    body("senderNumber", "please enter a valid number")
      .not()
      .isEmpty()
      .isLength({ min: 10, max: 13 })
      .isNumeric()
      .withMessage("Please enter a valid Zimbabwean mobile number")
      .trim()
      .escape(),
    body("receiverNumber", "please enter a valid number")
      .not()
      .isEmpty()
      .isLength({ min: 10, max: 13 })
      .isNumeric()
      .withMessage("Please enter a valid Zimbabwean mobile number")
      .trim()
      .escape(),
    body("subject")
      .optional()
      .isLength({ min: 3, max: 25 })
      .withMessage("Please enter a valid Subject")
      .trim()
      .escape(),

    body("deliverySlot", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .notEmpty()
      .trim()
      .escape(),
    body("pickUpSlot", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .notEmpty()
      .trim()
      .escape(),
    body("typeOfParcel", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
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
    console.log(result);
    //mapped only returns the first error
    return res.json({ errors: result.mapped() });
  }
  console.log("Validation passed");
  return next();
};
module.exports = { validationRules, validate };
// validation still needs to be consolidated
