/* =========================================
   SUNSEEKER — ADOPT A CELL
   JavaScript
   ========================================= */


/* =========================================
   SETTINGS
   ========================================= */

/*
 * Total number of solar cells.
 */
const TOTAL_CELLS = 60;


/*
 * Adoption price.
 */
const CELL_PRICE = 25;


/*
 * =========================================
 * PAYMENT URL
 * =========================================
 *
 * Leave this empty until you have your
 * real payment page.
 *
 * Example later:
 *
 * const PAYMENT_URL =
 *   "https://your-real-payment-link.com";
 *
 * DO NOT put a fake URL here.
 */
const PAYMENT_URL = "";


/*
 * =========================================
 * ADOPTED CELLS
 * =========================================
 *
 * This is intentionally empty right now.
 *
 * DO NOT add cells here unless they are
 * actually confirmed as adopted.
 *
 * Later, this information should come
 * from your payment/database system.
 */
const adoptedCells = {};


/* =========================================
   STATE
   ========================================= */

let selectedCellNumber = null;


/* =========================================
   DOM ELEMENTS
   ========================================= */

const solarArray =
  document.getElementById("solarArray");

const cellModal =
  document.getElementById("cellModal");

const cellDetails =
  document.getElementById("cellDetails");

const checkout =
  document.getElementById("checkout");

const adoptedDetails =
  document.getElementById("adoptedDetails");

const selectedCell =
  document.getElementById("selectedCell");

const checkoutCell =
  document.getElementById("checkoutCell");

const adoptedCellTitle =
  document.getElementById("adoptedCellTitle");

const adopterName =
  document.getElementById("adopterName");

const cellStatus =
  document.getElementById("cellStatus");

const donorName =
  document.getElementById("donorName");

const donorEmail =
  document.getElementById("donorEmail");

const displayPreference =
  document.getElementById("displayPreference");

const selectedText =
  document.getElementById("selectedText");

const availableCount =
  document.getElementById("availableCount");

const adoptedCount =
  document.getElementById("adoptedCount");

const totalCount =
  document.getElementById("totalCount");

const indicatorDot =
  document.getElementById("indicatorDot");

const paymentButton =
  document.getElementById("paymentButton");


/* =========================================
   SAFETY CHECK
   ========================================= */

if (!solarArray) {
  console.error(
    "Sunseeker Adopt a Cell: #solarArray was not found."
  );
}


/* =========================================
   CREATE CELLS
   ========================================= */

function createCells() {

  if (!solarArray) {
    return;
  }

  solarArray.innerHTML = "";


  for (
    let number = 1;
    number <= TOTAL_CELLS;
    number++
  ) {

    const cell =
      document.createElement("button");

    cell.type = "button";

    cell.className = "cell";

    cell.dataset.cellNumber = number;


    /*
     * Format cell number:
     *
     * 001
     * 002
     * 003
     */
    const formattedNumber =
      String(number).padStart(3, "0");


    /*
     * Cell number text.
     */
    const numberLabel =
      document.createElement("span");

    numberLabel.className =
      "cell-number";

    numberLabel.textContent =
      formattedNumber;


    cell.appendChild(numberLabel);


    /*
     * Determine cell status.
     */
    if (adoptedCells[number]) {

      cell.classList.add("adopted");

      cell.setAttribute(
        "aria-label",
        `Cell ${formattedNumber}, adopted`
      );

    } else {

      cell.classList.add("available");

      cell.setAttribute(
        "aria-label",
        `Cell ${formattedNumber}, available`
      );

    }


    /*
     * Open cell when clicked.
     */
    cell.addEventListener(
      "click",
      () => openCell(number)
    );


    solarArray.appendChild(cell);

  }


  updateCounts();

}


/* =========================================
   UPDATE COUNTS
   ========================================= */

function updateCounts() {

  const adopted =
    Object.keys(adoptedCells).length;

  const available =
    TOTAL_CELLS - adopted;


  if (adoptedCount) {
    adoptedCount.textContent =
      adopted;
  }


  if (availableCount) {
    availableCount.textContent =
      available;
  }


  if (totalCount) {
    totalCount.textContent =
      TOTAL_CELLS;
  }

}


/* =========================================
   OPEN CELL
   ========================================= */

function openCell(number) {

  selectedCellNumber = number;


  const formattedNumber =
    String(number).padStart(3, "0");


  /*
   * Update modal information.
   */

  if (selectedCell) {
    selectedCell.textContent =
      `Cell #${formattedNumber}`;
  }

  if (checkoutCell) {
    checkoutCell.textContent =
      `Cell #${formattedNumber}`;
  }

  if (adoptedCellTitle) {
    adoptedCellTitle.textContent =
      `Cell #${formattedNumber}`;
  }


  /*
   * Remove previous selected state.
   */

  document
    .querySelectorAll(".cell.selected")
    .forEach(cell => {

      cell.classList.remove("selected");

    });


  /*
   * Find clicked cell.
   */

  const clickedCell =
    document.querySelector(
      `.cell[data-cell-number="${number}"]`
    );


  if (clickedCell) {

    clickedCell.classList.add("selected");

  }


  /*
   * Update indicator.
   */

  if (selectedText) {
    selectedText.textContent =
      `Cell #${formattedNumber}`;
  }


  if (indicatorDot) {
    indicatorDot.style.background =
      "var(--gold)";
  }


  /*
   * Determine status.
   */

  if (adoptedCells[number]) {

    showAdoptedCell(number);

  } else {

    showAvailableCell();

  }


  /*
   * Open modal.
   */

  if (cellModal) {

    cellModal.classList.add("active");

    cellModal.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  /*
   * Prevent background scrolling.
   */

  document.body.style.overflow =
    "hidden";

}


/* =========================================
   SHOW AVAILABLE CELL
   ========================================= */

function showAvailableCell() {

  if (cellDetails) {
    cellDetails.hidden = false;
  }

  if (checkout) {
    checkout.hidden = true;
  }

  if (adoptedDetails) {
    adoptedDetails.hidden = true;
  }


  if (cellStatus) {

    cellStatus.textContent =
      "AVAILABLE";

    cellStatus.className =
      "modal-status available";

  }

}


/* =========================================
   SHOW ADOPTED CELL
   ========================================= */

function showAdoptedCell(number) {

  if (cellDetails) {
    cellDetails.hidden = true;
  }

  if (checkout) {
    checkout.hidden = true;
  }

  if (adoptedDetails) {
    adoptedDetails.hidden = false;
  }


  const name =
    adoptedCells[number];


  if (adopterName) {

    adopterName.textContent =
      name || "Sunseeker Supporter";

  }

}


/* =========================================
   SHOW CHECKOUT
   ========================================= */

function showCheckout() {

  /*
   * Make sure a cell is selected.
   */
  if (!selectedCellNumber) {
    return;
  }


  /*
   * Don't allow adopted cells
   * to reach checkout.
   */
  if (adoptedCells[selectedCellNumber]) {

    alert(
      "Sorry, this cell has already been adopted. Please choose another cell."
    );

    return;
  }


  if (cellDetails) {
    cellDetails.hidden = true;
  }

  if (checkout) {
    checkout.hidden = false;
  }

  if (adoptedDetails) {
    adoptedDetails.hidden = true;
  }


  /*
   * Focus name field.
   */
  if (donorName) {

    setTimeout(
      () => donorName.focus(),
      100
    );

  }

}


/* =========================================
   BACK TO CELL
   ========================================= */

function backToCell() {

  if (checkout) {
    checkout.hidden = true;
  }

  if (cellDetails) {
    cellDetails.hidden = false;
  }

}


/* =========================================
   VALIDATE FORM
   ========================================= */

function validateForm() {

  if (!donorName || !donorEmail) {
    return false;
  }


  const name =
    donorName.value.trim();

  const email =
    donorEmail.value.trim();


  /*
   * Name required.
   */

  if (!name) {

    donorName.focus();

    alert(
      "Please enter the name you'd like associated with your cell."
    );

    return false;

  }


  /*
   * Email required.
   */

  if (!email) {

    donorEmail.focus();

    alert(
      "Please enter your email address."
    );

    return false;

  }


  /*
   * Basic email validation.
   */

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (!emailPattern.test(email)) {

    donorEmail.focus();

    alert(
      "Please enter a valid email address."
    );

    return false;

  }


  return true;

}


/* =========================================
   CONTINUE TO PAYMENT
   ========================================= */

function continueToPayment() {

  /*
   * Validate form first.
   */

  if (!validateForm()) {
    return;
  }


  /*
   * Make sure a cell is still available.
   */

  if (
    adoptedCells[selectedCellNumber]
  ) {

    alert(
      "Sorry, this cell has already been adopted. Please choose another cell."
    );

    showAdoptedCell(
      selectedCellNumber
    );

    return;

  }


  /*
   * Collect adoption information.
   *
   * This is NOT stored permanently yet.
   *
   * A real backend/payment system will
   * eventually handle this information.
   */

  const adoptionData = {

    cellNumber:
      selectedCellNumber,

    displayName:
      donorName.value.trim(),

    email:
      donorEmail.value.trim(),

    displayPreference:
      displayPreference
        ? displayPreference.value
        : "name",

    amount:
      CELL_PRICE

  };


  /*
   * Useful for testing right now.
   */

  console.log(
    "Sunseeker adoption information:",
    adoptionData
  );


  /* =======================================
     PAYMENT SYSTEM
     ======================================= */

  /*
   * If a real payment URL has been added,
   * redirect the supporter there.
   */

  if (PAYMENT_URL) {

    /*
     * IMPORTANT:
     *
     * The payment provider/backend should
     * eventually associate the payment with
     * the selected cell number.
     */

    window.location.href =
      PAYMENT_URL;

    return;

  }


  /*
   * PAYMENT IS NOT CONNECTED YET
   */

  alert(
    "The payment system is not connected yet. Your cell selection has not been finalized or marked as adopted."
  );

}


/* =========================================
   CLOSE MODAL
   ========================================= */

function closeModal() {

  if (cellModal) {

    cellModal.classList.remove(
      "active"
    );

    cellModal.setAttribute(
      "aria-hidden",
      "true"
    );

  }


  /*
   * Restore scrolling.
   */

  document.body.style.overflow =
    "";


  /*
   * Remove selected state.
   */

  document
    .querySelectorAll(".cell.selected")
    .forEach(cell => {

      cell.classList.remove(
        "selected"
      );

    });


  /*
   * Reset state.
   */

  selectedCellNumber = null;


  if (selectedText) {
    selectedText.textContent =
      "Select a cell";
  }


  if (indicatorDot) {
    indicatorDot.style.background =
      "#8b9690";
  }


  /*
   * Reset modal sections.
   */

  if (cellDetails) {
    cellDetails.hidden = false;
  }

  if (checkout) {
    checkout.hidden = true;
  }

  if (adoptedDetails) {
    adoptedDetails.hidden = true;
  }


  /*
   * Clear form.
   */

  if (donorName) {
    donorName.value = "";
  }

  if (donorEmail) {
    donorEmail.value = "";
  }

  if (displayPreference) {
    displayPreference.value =
      "name";
  }

}


/* =========================================
   EVENT LISTENERS
   ========================================= */

const adoptButton =
  document.getElementById(
    "adoptButton"
  );

const backButton =
  document.getElementById(
    "backButton"
  );

const closeButton =
  document.getElementById(
    "closeModal"
  );

const adoptedCloseButton =
  document.getElementById(
    "adoptedCloseButton"
  );

const modalOverlay =
  document.getElementById(
    "modalOverlay"
  );


/*
 * Adopt button.
 */

if (adoptButton) {

  adoptButton.addEventListener(
    "click",
    showCheckout
  );

}


/*
 * Payment button.
 */

if (paymentButton) {

  paymentButton.addEventListener(
    "click",
    continueToPayment
  );

}


/*
 * Back button.
 */

if (backButton) {

  backButton.addEventListener(
    "click",
    backToCell
  );

}


/*
 * Close button.
 */

if (closeButton) {

  closeButton.addEventListener(
    "click",
    closeModal
  );

}


/*
 * Adopted cell close button.
 */

if (adoptedCloseButton) {

  adoptedCloseButton.addEventListener(
    "click",
    closeModal
  );

}


/*
 * Click outside modal.
 */

if (modalOverlay) {

  modalOverlay.addEventListener(
    "click",
    closeModal
  );

}


/* =========================================
   ESCAPE KEY
   ========================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      cellModal &&
      cellModal.classList.contains("active")
    ) {

      closeModal();

    }

  }
);


/* =========================================
   CURRENT YEAR
   ========================================= */

const currentYear =
  document.getElementById(
    "currentYear"
  );

if (currentYear) {

  currentYear.textContent =
    new Date().getFullYear();

}


/* =========================================
   INITIALIZE
   ========================================= */

createCells();