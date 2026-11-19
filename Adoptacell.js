/* Sunseeker Adopt a Cell — reservations, no payments collected */
const TOTAL_CELLS = 384;
const CELL_PRICE = 20;
const reservedCells = {};
let selectedCellNumber = null;
let availabilityLoaded = false;
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
      cell.disabled = !availabilityLoaded;
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
  if (!availabilityLoaded) return;
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
  if ($('donorEmail')) $('donorEmail').value = '';
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
async function loadReservedCells() {
  availabilityLoaded = false;
  createCells();
  try {
    const response = await fetch('/api/cell-reservations', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not retrieve cell availability');
    const reservations = await response.json();
    if (!Array.isArray(reservations)) throw new Error('Invalid availability response');
    Object.keys(reservedCells).forEach(key => delete reservedCells[key]);
    reservations.forEach(({ cellNumber, displayName }) => {
      if (Number.isInteger(cellNumber) && cellNumber >= 1 && cellNumber <= TOTAL_CELLS)
        reservedCells[cellNumber] = displayName || 'Sunseeker Supporter';
    });
    availabilityLoaded = true;
  } catch (error) {
    console.error('Reservation availability unavailable', error);
    if ($('selectedText')) $('selectedText').textContent = 'Reservations temporarily unavailable';
  }
  createCells();
}
async function reserveCell() {
  const name = $('donorName')?.value.trim();
  const email = $('donorEmail')?.value.trim();
  const displayPreference = $('displayPreference')?.value || 'name';
  const cellNumber = selectedCellNumber;
  if ($('reservationError')) $('reservationError').hidden = true;
  if (!name || name.length > 100) return showError('Please enter a display name (up to 100 characters).');
  if (!email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
  if (!cellNumber || hasReservation(cellNumber) || !availabilityLoaded) return showError('This cell is not available.');
  const button = $('paymentButton');
  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/cell-reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellNumber, donorName: name, donorEmail: email, displayPreference })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to reserve cell.');
    reservedCells[cellNumber] = result.displayName || 'Sunseeker Supporter';
    closeModal();
    createCells();
    alert(`Cell #${fmt(cellNumber)} is reserved! No payment was collected. The Sunseeker team will contact you at ${email} about the $${CELL_PRICE} contribution.`);
  } catch (error) {
    showError(error.message);
    if (/already reserved/i.test(error.message)) await loadReservedCells();
  } finally {
    if (button) button.disabled = false;
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