/* Sunseeker Adopt a Cell — reservations, no payments collected */
const TOTAL_CELLS = 384;
const CELL_PRICE = 20;
const reservedCells = {};
let selectedCellNumber = null;
const STORAGE_KEY = 'sunseeker-cell-reservations-v1';
let availabilityLoaded = true;
const $ = id => document.getElementById(id);
const fmt = n => String(n).padStart(3, '0');
const hasReservation = n => Object.prototype.hasOwnProperty.call(reservedCells, n);

function createCells() {
  const array = $('solarArray');
  if (!array) return;
  array.replaceChildren();
  const rows = 8, columns = 48;
  const imageWidth = 390, imageHeight = 142;
  const topY = 25, bottomY = 117, rearX = 374;
  for (let row = 0; row < rows; row++) {
    const distance = Math.abs((row + 0.5) / rows - 0.5) * 2;
    const frontX = 46 + 135 * Math.pow(distance, 1.65);
    const rowWidth = rearX - frontX;
    for (let col = 0; col < columns; col++) {
      const number = row * columns + col + 1;
      const cell = document.createElement('button');
      const reserved = hasReservation(number);
      cell.type = 'button';
      cell.className = `cell ${reserved ? 'adopted' : 'available'}`;
      cell.dataset.cellNumber = number;
      cell.style.left = `${100 * (frontX + col * rowWidth / columns) / imageWidth}%`;
      cell.style.top = `${100 * (topY + row * (bottomY - topY) / rows) / imageHeight}%`;
      cell.style.width = `${100 * rowWidth / columns / imageWidth}%`;
      cell.style.height = `${100 * (bottomY - topY) / rows / imageHeight}%`;
      cell.disabled = false; // Allow inspection even if the reservation server is offline.
      cell.setAttribute('aria-label', `Cell ${fmt(number)}, ${reserved ? 'reserved' : 'available'}`);
      const label = document.createElement('span');
      label.className = 'cell-number';
      label.textContent = fmt(number);
      cell.append(label);
      cell.addEventListener('click', () => openCell(number));
      array.append(cell);
    }
  }
  updateCounts();
}
function updateCounts() {
  const reserved = Object.keys(reservedCells).length;
  if ($('availableCount')) $('availableCount').textContent = availabilityLoaded ? TOTAL_CELLS - reserved : '—';
  if ($('adoptedCount')) $('adoptedCount').textContent = availabilityLoaded ? reserved : '—';
  if ($('totalCount')) $('totalCount').textContent = TOTAL_CELLS;
}
function showSection(id) {
  ['cellDetails', 'checkout', 'adoptedDetails'].forEach(name => {
    if ($(name)) $(name).hidden = name !== id;
  });
}
function openCell(number) {
  selectedCellNumber = number;
  document.querySelectorAll('.cell.selected').forEach(c => c.classList.remove('selected'));
  const button = document.querySelector(`[data-cell-number="${number}"]`);
  if (button) button.classList.add('selected');
  ['selectedCell', 'checkoutCell', 'adoptedCellTitle'].forEach(id => {
    if ($(id)) $(id).textContent = `Cell #${fmt(number)}`;
  });
  if ($('selectedText')) $('selectedText').textContent = `Cell #${fmt(number)}`;
  if ($('indicatorDot')) $('indicatorDot').style.background = 'var(--ad-gold)';
  if (hasReservation(number)) {
    showSection('adoptedDetails');
    if ($('adopterName')) $('adopterName').textContent = reservedCells[number];
  } else showSection('cellDetails');
  $('cellModal').classList.add('active');
  $('cellModal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('closeModal')?.focus();
}
function closeModal() {
  $('cellModal').classList.remove('active');
  $('cellModal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.querySelectorAll('.cell.selected').forEach(c => c.classList.remove('selected'));
  selectedCellNumber = null;
  if ($('selectedText')) $('selectedText').textContent = 'Select a cell';
  if ($('indicatorDot')) $('indicatorDot').style.background = '#8b9690';
  if ($('donorName')) $('donorName').value = '';

  if ($('reservationError')) $('reservationError').hidden = true;
  showSection('cellDetails');
}
function showCheckout() {
  if (!selectedCellNumber || hasReservation(selectedCellNumber)) return;
  showSection('checkout');
  $('donorName')?.focus();
}
function showError(message) {
  const element = $('reservationError');
  if (element) { element.textContent = message; element.hidden = false; }
  else alert(message);
}
function loadReservedCells() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw Error('Invalid stored data');
    for (const [key, value] of Object.entries(stored)) {
      const number = Number(key);
      if (Number.isInteger(number) && number >= 1 && number <= TOTAL_CELLS && typeof value === 'string') {
        reservedCells[number] = value;
      }
    }
  } catch (error) {
    console.warn('Could not load local reservations', error);
    showError('Your browser is blocking local storage. Reservations may not be saved.');
  }
  createCells();
}
function reserveCell() {
  const name = $('donorName')?.value.trim();
  const cellNumber = selectedCellNumber;
  if ($('reservationError')) $('reservationError').hidden = true;
  if (!name || name.length > 100) return showError('Enter a display name (up to 100 characters).');
  if (!cellNumber || hasReservation(cellNumber)) return showError('This cell is already reserved.');
  try {
    const next = { ...reservedCells, [cellNumber]: name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    reservedCells[cellNumber] = name;
    closeModal();
    createCells();
    alert(`Cell #${fmt(cellNumber)} is marked reserved for ${name} on this browser. No payment collected. This does not reserve it for other visitors.`);
  } catch (error) {
    showError('Your browser did not save the reservation. Enable local storage or open the site in a normal browser window.');
  }
}
$('adoptButton')?.addEventListener('click', showCheckout);
$('paymentButton')?.addEventListener('click', reserveCell);
$('backButton')?.addEventListener('click', () => showSection('cellDetails'));
$('closeModal')?.addEventListener('click', closeModal);
$('adoptedCloseButton')?.addEventListener('click', closeModal);
$('modalOverlay')?.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('cellModal')?.classList.contains('active')) closeModal();
});
if ($('currentYear')) $('currentYear').textContent = new Date().getFullYear();
loadReservedCells();
