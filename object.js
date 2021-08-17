/* if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ready);
} */

function objectifier() {
  /* var input, nametag;
function requiredFieldError(input, message) {
  this.input = input;
  this.message = message;

  function show() {
    alert("this " + this.input + "contains " + this.message);
  }
}

nametag = document.getElementById("name").innerText;
let inputfields = new requiredFieldError(
  nametag,
  this.input + " is a required field!"
);
requiredFieldError(); */

  let firstname = document.getElementById("name").value;
  let lastname = document.getElementById("last").value;
  let age = document.getElementById("age").value;
  let interests = document.getElementById("interests").value;
  let gender = document.getElementById("gender").value;
  var demo = document.getElementById("demo");

  /* function Person(first, last, age, gender, interests) {
    this.name = {
      first: first,
      last: last,
    };
    this.age = age;
    this.gender = gender;
    this.interests = [interests];
    this.bio = function () {
      demo.innerText =
        this.name.first +
        " " +
        this.name.last +
        " is " +
        this.age +
        " years old. He likes " +
        this.interests[0] +
        " and " +
        this.interests[1] +
        ".";
    };
    this.greeting = function () {
      alert("Hi! I'm " + this.name.first + ".");
    };
  }

  let mac = new Person("Macdonald", "kawara", "34", "male", "soccer");
  let nicole = new Person("Nicole", "Kawara", "6", "female", [
    "kingJulian",
    "BossBaby",
    "other",
  ]);
  let mitchell = new Person("Mitchel", "kawara", "17", "female");
  let generic = new Person(firstname, lastname, age, gender, interests);
  mac.greeting();
  nicole.bio();
  mitchell.greeting();
  generic.bio();
} */
  let form2 = document.getElementById("formObject");
  let inputsFields = form2.querySelectorAll("input");

  let selectField = form2.querySelector("select");
  let options = selectField.querySelectorAll("option");
  selectFieldAssignment();
  function selectFieldAssignment() {
    for (let i = 0; i < options.length; i++) {
      const element = options[i];
      const selectedOption = element.selected;
      console.log(selectedOption);
      demo.innerText = element.innerText;
    }
  }

  for (let i = 0; i < inputsFields.length; i++) {
    const inputField = inputsFields[i];

    //  const small = this.parentElement.querySelector("small");

    function inputValidation(inputField) {
      this.inputsField = inputField;
      const small = inputField.parentElement.querySelector("small");

      this.setError = function () {
        inputField.parentElement.className = "form-control error";
      };
      this.empty = function () {
        small.innerText = inputField.name + " is required";
      };
      this.invalid = function () {
        small.innerText = inputField.name + " is invalid";
      };
      this.setSuccess = function () {
        //small.innerText = message;
        inputField.parentElement.className = "form-control success";
      };
    }
    let nameFields = new inputValidation(inputField);
    if (inputField.value === "") {
      nameFields.setError();
      nameFields.empty();
    } else if (/^[a-z ,.'-]+$/i.test(inputField.value) === true) {
      nameFields.setError();
      nameFields.invalid();
    } else {
      nameFields.setSuccess();
    }
    let selectFields = new inputValidation(selectField);
    if (selectField.value === "SELECT ONE") {
      selectFields.setError();
      selectFields.empty();
    } else {
      selectFields.setSuccess();
    }
  }
}
