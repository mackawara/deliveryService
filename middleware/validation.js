const { body, validationResult } = require("express-validator");
const validationRules = () => {
  return [
    body("email")
      .isEmail()
      .isLength({ min: 4 })
      .withMessage("Please enter a valid email")
      .normalizeEmail()
      .trim()
      .escape(),
    body("name")
      .not()
      .isEmpty()
      .withMessage("Please enter your name")
      .isLength({ min: 2, max: 35 })
      .withMessage("Please ensure that your name contains no numbers")
      .trim()
      .escape(),
    //.isAlpha()

    body("mobileNumber", "please enter a valid number")
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
    body("text")
      .not()
      .isEmpty()
      .isLength({ min: 15, max: 150 })
      .withMessage("Your message is not detailed enough")
      .trim()
      .escape(),
      body("deliverySlot")
      .not().matches(/SELECT ONE/g).withMessage("please make a valid selection"),
      body("pickUpSlot")
      .not().matches(/SELECT ONE/g).withMessage("please make a valid selection"),
      body("typeOfParcel")
      .not().matches(/SELECT ONE/g).withMessage("please make a valid selection"),
      body("departureLocation")
      .not().matches(/SELECT ONE/g).withMessage("please make a valid selection"),
      body("destinationOfParcel")
      .not().matches(/SELECT ONE/g).withMessage("please make a valid selection"),

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