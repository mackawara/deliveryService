window.addEventListener("DOMContentLoaded", async () => {
  console.log("dom content loaded");

  const typeOfParcel = document.getElementById("typeOfParcel");
  const dimensionFields = document.querySelector(".dimensions");
  dimensionFields.style.display = "none";
  typeOfParcel.addEventListener("change", (e) => {
    if (
      typeOfParcel.value === "Hardware" ||
      typeOfParcel.value === "Box" ||
      typeOfParcel.value === "Other"
    ) {
      dimensionFields.style.display = "flex";
    } else if (
      typeOfParcel.value === "Cash" ||
      typeOfParcel.value === "Envelope" ||
      typeOfParcel.value == "Groceries"
    ) {
      dimensionFields.style.display = "none";
    }
    console.log(dimensionFields);
  });

  let data = {};
  let inputErrors = [];
  console.log(inputErrors);
  var form = document.getElementById("myForm");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    inputErrors = [];
    formValidator();
  });

  async function formValidator() {
    console.log("validotor running");
    const selects = form.querySelectorAll("select");
    const inputs = form.querySelectorAll(".inputs");

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
        small.innerText = "Cannot be empty!";
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

    const numbers = form.querySelectorAll(".numbers");
    numbers.forEach((number) => {
      const numberfield = new inputValidator(number);
      if (number.value.length > 13 || number.value.length < 10) {
        numberfield.invalid();
        numberfield.setError();
        console.log(numbers);
      } else if (!/((\+263|0)7[7-8|1|3][0-9]{7}$)/.test(number.value)) {
        numberfield.invalid();
        numberfield.setError();
        console.log("number regex not match");
      } else numberfield.setSuccess();
    });

    const email = form.querySelector("#email");
    const emailField = new inputValidator(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      emailField.invalid();
      emailField.setError();
    } else emailField.setSuccess();

    const names = form.querySelectorAll(".names");
    names.forEach((name) => {
      const namefield = new inputValidator(name);
      if (name.value.length > 35 || name.value.length < 3) {
        namefield.invalid();
        namefield.setError();
      } else if (name.value.match(/[0-9]/g)) {
        namefield.invalid();
        namefield.setError();
        console.log("regex not match");
      } else namefield.setSuccess();
    });
    // VALIDATE INDIVIDUAL OR GRUP OF FIELDS
    selects.forEach((select) => {
      const selectFields = new inputValidator(select);
      if (select.value == "SELECT ONE") {
        selectFields.setError();
        selectFields.invalid();
        console.log("please make selection");
      } else selectFields.setSuccess();
    });

    inputs.forEach((input) => {
      const inputField = new inputValidator(input);

      input.value === ""
        ? inputField.empty()
        : input.style.display == "none"
        ? inputField.setSuccess()
        : console.log(input);
    });

    console.log(data);
    console.log(inputErrors);
    if (inputErrors.length == 0) {
      sendForm(data);
    }
  }
  const sendForm = (object) => {
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",
      redirect: "follow",
      body: JSON.stringify(object),
    };
    fetch("/booking", options).then((response) =>
      response.json().then((data) => {
        const result = document.getElementById("results");
        result.style.display = "block";

        if (response.status == "200") {
          form.remove();
          document.getElementById(
            "registrationConfirmation"
          ).innerText = ` Thank you ${data.Name} for your booking.Our team will be in touch soon`;
          console.log("SUCCESS");
          for (const any in data) {
            const p = document.createElement("p");
            const personalDetails = `${any}: ${data[any]}`;
            p.innerText = personalDetails;
            result.appendChild(p);
            result.classList.remove("error");
          }
        } else if (response.status == "500") {
          const confirmation = document.querySelector("#confrimation");
          confirmation.classList.add("error");
          confirmation.innerText = `${data}`;
        } else if (response.status == "422") {
          /* status 422 sent if data submitted fails the DB schema validation */
          /* status 422 sent if data submitted fails the DB schema validation */
          for (const any in data) {
            console.log(`${any}`);
            const errorField = document.getElementById(`${any}`).parentElement;
            errorField.classList = "input-grp error";
            errorField.querySelector("small").innerText = `${any.message}`;
          }
        }
      })
    );
  };
});
