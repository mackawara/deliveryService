window.addEventListener("DOMContentLoaded", async () => {
  console.log("dom content loaded");
});

const numbers = [1, 2, 3, 4, 5, 8, 9, 11, 23];
//console.log(numbers[3]);
const numbers2 = numbers.filter((number) => {
  return number < 6;
});
console.log(numbers2);

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
/* form.addEventListener("submit", function (e) {
  assign();
  e.preventDefault();
}); */
document.querySelector("#date").innerHTML = new Date();

var selects = [];
function assign() {
  var inputs,
    input,
    email,
    firstAndLastNames,
    names,
    phoneNumbers,
    phoneNumber,
    dimensions,
    dimension;

  var form = document.getElementById("myForm");

  firstAndLastNames = form.querySelectorAll(".names");
  for (var b = 0, len = firstAndLastNames.length; b < len; b++) {
    names = firstAndLastNames[b];

    let nameFields = new inputValidation(names);
    if (
      names.value.length > 35 ||
      /^[a-z ,.'-]+$/i.test(names.value) === false
    ) {
      nameFields.setError();
      nameFields.invalid();
    } else {
      nameFields.setSuccess();
    }
  }

  inputs = form.querySelectorAll("input");
  for (var i = 0, len = inputs.length; i < len; i++) {
    //loops through all the inputs. this helps in blanket
    input = inputs[i];
    let inputFields = new inputValidation(input);
    if (input.value === "") {
      inputFields.setError();
      inputFields.empty();
    }
  }

  phoneNumbers = form.querySelectorAll(".phoneNumber");

  for (let i = 0; i < phoneNumbers.length; i++) {
    phoneNumber = phoneNumbers[i];
    let phoneNumberFields = new inputValidation(phoneNumber);
  }

  dimensions = form.querySelectorAll(".dimensions");
  for (let i = 0; i < dimensions.length; i++) {
    dimension = dimensions[i];

    function isNumeric(n) {
      return !isNaN(parseFloat(n)) && isFinite(n) && n > 0; //checks it is a valid number that above 0 and returns tru if the number is valide
    }
    let dimensionFields = new inputValidation(dimension);
    if (dimension.value === "") {
      dimensionFields.setError();
      dimensionFields.empty();
    } else if (isNumeric(dimension.value) === false) {
      dimensionFields.setError();
      dimensionFields.invalid();
    } else {
      dimensionFields.setSuccess();
    }
  }
  email = document.getElementById("userEmail");
  let emailField = new inputValidation(email);
  if (
    /(?!^[.+&'_-]*@.*$)(^[_\w\d+&'-]+(\.[_\w\d+&'-]*)*@[\w\d-]+(\.[\w\d-]+)*\.(([\d]{1,3})|([\w]{2,}))$)/.test(
      email.value
    ) === false
  ) {
    emailField.setError();
    emailField.invalid();
    console.log("testInvalidError");
  } else {
    emailField.setSuccess();
    console.log("testSuccess");
  }
  /* 
 selects = [
   destination,
   pickUpSlotTime,
   deliverySlotTime,
   typeOfParcel,
   departureLocation,
 ];

 for (var i = 0, len = selects.length; i < len; i++) {
   //loops through all the selects. this helps in blanket
   select = selects[i];
   if (selects[i].value === "SELECT ONE") {
     // alert("Please make a valid selection for "+ selects[i].name);
     selects[i].parentElement.classList.add("error");
     /* console.log(selects[i].parentElement.classList) 
   } else {
     selects[i].parentElement.classList.add("success");
     selects[i].parentElement.classList.remove("error");
   }
 } */
  function inputValidation(inputsField) {
    this.inputsField = inputsField;
    const small = inputsField.parentElement.querySelector("small");

    this.setError = function () {
      inputsField.parentElement.className = "form-control error";
    };
    this.empty = function () {
      small.innerText = inputsField.name + " cannot be empty";
    };
    this.invalid = function () {
      small.innerText = " Please enter a valid " + inputsField.name;
    };
    this.setSuccess = function () {
      //small.innerText = message;
      inputsField.parentElement.className = "form-control success";
    };
  }
  //Required field validation:Checks if all inputs have been filled

  var phoneno = /^\+?([0-9]{2})\)?[-. ]?([0-9]{4})[-. ]?([0-9]{4})$/;

  /* let phoneNumberFields = new inputValidation(phoneNumber);
  if (phoneno.match(phoneNumber.value) === true) {
    phoneNumberFields.invalid();
  } else {
    phoneNumberFields.setSuccess();
  } */
}
function deliveryChargeCalculator() {
  d = new Date();
  var currentDate = d.getTime().toString().slice(-9);
  wayBillNumber =
    departureLocation.slice(0, 3).toUpperCase() +
    destination.slice(0, 3).toUpperCase() +
    pickUpSlotTime.slice(0, 2) +
    deliverySlotTime.slice(0, 2) +
    currentDate;
  /*wayBillNumber is generated by slicing  the first 3 letters of deoarture location and destination LWEMAD is a for a parcel from lwndulu to Madumabisa
  this is followed bythe first 2 numbers of departure  and destination slot times.Hence the fist 10 characters of the waybill number show where the parcel isfrom and where it is going and the designate times*/
  // document.getElementById("deliveryCost").innerHTML = " Your package, waybill number ( " + wayBillNumber + ") will be picked up from " + departureLocation +
  // " between " + pickUpSlotTime + " and will be delivered to " + destination + " between " + deliverySlotTime + " and the cost will be " + deliverycost;
}
