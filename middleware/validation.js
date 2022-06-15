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
      .isAlpha()
      .withMessage("Please ensure that there are no numerals in your name")
      .trim()
      .escape(),
    body("receiverName")
    .not()
    .isEmpty()
    .withMessage("Please enter your name")
    .isLength({ min: 2, max: 35 })
    .withMessage("Please ensure that your name is valid")
    .isAlpha()
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
      .notEmpty()
      .trim()
      .escape(),
    body("destinationOfParcel", "You have made an invalid selection")
      .not()
      .matches(/SELECT ONE/g)
      .withMessage("please make a valid selection")
      .notEmpty()
      .trim()
      .escape(),
  ];
};

const validate = (req, res, next) => {
  console.log("validate is working");
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    console.log("validation passed");
    console.log(req.body);
    return next();
  } else {
    console.log("validation failed");
    const exctractedErrors = [];
    errors.array().map((err) => {
      exctractedErrors.push({ [err.param]: err.msg });
    });
    console.log(exctractedErrors);

    res.status(422).json({
      errors: exctractedErrors,
    });
  }
};
module.exports = { validationRules, validate };
// validation still needs to be consolidated
