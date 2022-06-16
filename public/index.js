window.addEventListener("DOMContentLoaded", async () => {
  console.log("dom content loaded");
});

const typeOfParcel = document.getElementById("typeOfParcel");
const dimensionFields = document.querySelector(".dimensions");
typeOfParcel.addEventListener("change", (e) => {
  console.log(dimensionFields);
  if (typeOfParcel.value === "Hardware" || typeOfParcel.value === "Box") {
    dimensionFields.style.display = "flex";
  } else {
    dimensionFields.style.display = "none";
  }
});

let data = {};
var form = document.getElementById("myForm");
form.addEventListener("submit", function (e) {
  e.preventDefault();
  formValidator();
});

async function formValidator() {
  console.log("validotor running");
  const selects = form.querySelectorAll("select");
  const inputs = form.querySelectorAll("input");

  let inputErrors = [];

  function inputValidator(inputsField) {
    this.inputsField = inputsField;
    const small = inputsField.parentElement.querySelector("small");
    const value = this.inputsField.value;
    const name = this.inputsField.name;
    /* set error is the function which catches all errors and inputs the errors CSS */
    this.setError = function () {
      inputsField.parentElement.className = "input-grp error";
      inputErrors.push(inputsField.name);
    };
    /* function which checks if field is empty */
    this.isEmpty = function () {
      return value == "";
    };
    this.tooShort = function (figure) {
      /* returns true if value is tool long */

      return value.length < figure;
    };
    this.tooLong = function (figure) {
      /* returns true if value is tool long */
      return value.length > figure;
    };

    /* function to run when the field is empty */
    this.empty = function () {
      console.log(`${inputsField.name} is empty`);
      small.innerText = "Cannot be empty";
      inputErrors.push(inputsField.name);
    };
    /* input the errors message into the small tag */
    this.invalid = function () {
      console.log("invalid");
      small.innerText = `Invalid input `;

      inputErrors.push(`${inputsField.name}`);
    };
    this.setSuccess = async function () {
      /* first remove existing enty in inout errors , if any */
      const index = inputErrors.indexOf(inputsField.name);
      if (index > -1) {
        inputErrors.splice(index, 1); // 2nd parameter means remove one item only
      }
      /* remove any error messages */
      small.innerText = "";
      /* add styling to show successful validation */
      inputsField.parentElement.className = "input-grp success";
      /* append field data into entrant data Object */
      data[name] = value;
    };
  }

  // VALIDATE INDIVIDUAL OR GRUP OF FIELDS
  selects.forEach((select) => {
    const selectFields = new inputValidator(select);
    if (select.value == "SELECT ONE") {
      selectFields.setError();
      selectFields.invalid();
      console.log("please make selection");
    }
  });

  inputs.forEach((input) => {
    const inputField = new inputValidator(input);
    if (input.value === "") {
      console.log("input empty");
      inputField.setError();
      inputField.empty();
    }
  });

  const names = form.querySelectorAll(".names");
  names.forEach((name) => {
    const namefield = new inputValidator(name);
    if (name.value.length > 35 || name.value.length < 3) {
      namefield.invalid();
      namefield.setError();
    }
    /*  else if (){

    } */
  });
}
