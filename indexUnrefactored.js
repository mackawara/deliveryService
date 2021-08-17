if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ready);
}

var form = document.getElementById("myForm");
form.addEventListener("submit", function (e) {
  assign();
  e.preventDefault();
});

var selects = [];
function assign() {
  // var inputs = document.getElementsByTagName("input").innerHTML, input = null, select = null, not_pass = false;
  departureLocation = document.getElementById("departureLocation");
  destination = document.getElementById("destination");
  pickUpSlotTime = document.getElementById("pickUpSlot");
  deliverySlotTime = document.getElementById("deliverySlot");
  typeOfParcel = document.getElementById("typeOfParcel");
  // dimensions = document.getElementById("dimensions").innerHTML;
  //consignee = document.getElementById("userName").innerHTML.value
  // receiver = document.getElementById("userNameReceiver").innerHTML.value;

  weightvalue = document.getElementById("weight");
  lengthvalue = document.getElementById("length");
  widthvalue = document.getElementById("width");
  heightvalue = document.getElementById("height");
  volume = parseInt(length * width * height);
  cubicWeight = volume / 2800;
  checkInputs();
  //validate all inputs

  function checkInputs() {
    var inputs, input, email, firstAndLastNames, phoneNumbers, names;
    var form = document.getElementById("myForm");

    //select aall the input fields in the form
    checkEmail();

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
        /* console.log(selects[i].parentElement.classList) */
      } else {
        selects[i].parentElement.classList.add("success");
        selects[i].parentElement.classList.remove("error");
      }
    }

    //console.log(selects[i].classList)
    inputs = form.querySelectorAll(".dimensions");

    for (var i = 0, len = inputs.length; i < len; i++) {
      //loops through all the inputs. this helps in blanket
      input = inputs[i];

      weight = weightvalue.value.trim();
      length = lengthvalue.value.trim();
      height = heightvalue.value.trim();
      width = widthvalue.value.trim();

      function isNumeric(n) {
        // called whenchecking if it is a number
        return !isNaN(parseFloat(n)) && isFinite(n) && n > 0; //checks it is a valid number that above 0 and returns tru if the number is valide
      }

      switch (input.value) {
        case "": //checks if the input is blank
          setErrorFor(input, input.name + " is a required field!");
          break;

        default:
          setSuccessFor(input), checkIfValidNumber(input);
      }

      function checkIfValidNumber(input) {
        //use isNumeric to check if input entered is
        switch (isNumeric(input.value)) {
          case false:
            setErrorFor(
              input,
              input.name + " entered contains invalid characters!"
            );
            break;

          case true:
            setSuccessFor(input);
            // CheckIfIsEmail(email); // calls the fucion which checks the email fields
            break;
        }
      }
    }
    function setErrorFor(input, message) {
      const formControl = input.parentElement;
      const small = formControl.querySelector("small");
      formControl.className = "form-control error";
      small.innerText = message;
    }

    function setSuccessFor(input) {
      const formControl = input.parentElement;
      const small = formControl.querySelector("small");
      formControl.className = "form-control success";
    }

    senderFirstName = document.getElementById("senderFirstName");
    senderLastName = document.getElementById("senderLastName");
    receiverFirstName = document.getElementById("receiverFirstName");
    receiverLastName = document.getElementById("receiverLastName");

    firstAndLastNames = form.querySelectorAll(".names");

    /*  function checkIfValidName(){
     
console.log(element.value) 0779655359
    } */
    for (var b = 0, len = firstAndLastNames.length; b < len; b++) {
      names = firstAndLastNames[b];

      senderFirstNameValue = senderFirstName.value;
      senderLastNameValue = senderLastName.value;
      receiverFirstNameValue = receiverFirstName.value;
      receiverLastNameValue = receiverLastName.value;

      switch (names.value) {
        case "":
          setErrorFor(names, names.name + " is required. Please fill in!");

          break;

        default:
          checkIfValidName(names.value);
          // checkIfValidName(names.value);

          break;
      }
      function checkIfValidName() {
        //checks the names for digits 0-9
        switch (/^[a-z ,.'-]+$/i.test(names.value)) {
          case false:
            setErrorFor(names, names.name + " is invalid");

            break;

          default:
            checkeLengthOfName(names.value);

            break;
        }
      }
      function checkeLengthOfName() {
        if (names.value.length > 35) {
          setErrorFor(names, names.name + " is too long");
        } else {
          setSuccessFor(names);
        }
      }
    }
    phoneNumbers = form.querySelectorAll(".phoneNumber");
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      console.log(phoneNumber);

      if (phoneNumber.value === "") {
        setErrorFor(phoneNumber, phoneNumber.name + "is required!");
      } else if (
        /^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/.test(
          phoneNumber
        ) === true
      ) {
        setErrorFor(phoneNumber, phoneNumber.name + " is not valid");
      } else {
        setSuccessFor(phoneNumber);
      }

      function setErrorFor(phoneNumber, message) {
        const formControl = phoneNumber.parentElement;
        const small = formControl.getElementByTagName("small");
        console.log(small);
        formControl.className = "form-control error";
        small.innerText = message;
      }

      function setSuccessFor(phoneNumber) {
        const formControl = phoneNumber.parentElement;
        // element.classList.add("success");
        const small = formControl.querySelector("small");
        formControl.className = "form-control success";
      }
    }

    function checkEmail() {
      email = document.getElementById("userEmail").value;
      console.log(email);
      if (email === "") {
        setErrorFor(email, "please enter your email!");
      } else if (
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
          email
        ) === true
      ) {
        setErrorFor(email, "please enter a valid email address!");
      } else {
        setSuccessFor(email);
      }
      console.log(email);
    }
  }
  function setErrorFor(names, message) {
    const formControl = names.parentElement;
    const small = formControl.querySelector("small");
    formControl.className = "form-control error";
    small.innerText = message;
  }

  function setSuccessFor(names) {
    const formControl = names.parentElement;
    // element.classList.add("success");
    const small = formControl.querySelector("small");
    formControl.className = "form-control success";
  }

  function setErrorFor(email, message) {
    const formControl = email.parentElement;
    const small = formControl.querySelector("small");
    formControl.className = "form-control error";
    small.innerText = message;
  }

  function setSuccessFor(email) {
    const formControl = email.parentElement;
    const small = formControl.querySelector("small");
    formControl.className = "form-control success";
  }
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
