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

var form = document.getElementById("myForm");
form.addEventListener("submit", function (e) {
  e.preventDefault();

  const formData = new FormData(form);
  console.log(formData);
});
async function formValidation() {
  let inputErrors = [];

  function inputValidation(inputsField) {
    this.inputsField = inputsField;
    const small = inputsField.parentElement.querySelector("small");
    const value = this.inputsField.value;
    const name = this.inputsField.name;
    /* set error is the function which catches all errors and inputs the errors CSS */
    this.setError = function () {
      inputsField.parentElement.className = "input-group error";
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
    this.regexTest = function (regex) {
      return regex.test(value);
    };
    /* function to run when the field is empty */
    this.empty = function () {
      console.log(`${inputsField.name} is empty`);
      small.innerText = inputsField.name + " cannot be empty";
      inputErrors.push(inputsField.name);
    };
    /* input the errors message into the small tag */
    this.invalid = function () {
      console.log("invalid");
      small.innerText = ` Please enter a valid  ${inputsField.name}`;

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
      inputsField.parentElement.className = "input-group success";
      /* append field data into entrant data Object */
      entrantData[name] = value;
    };
  }
}
