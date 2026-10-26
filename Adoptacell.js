/* Sunseeker Adopt a Cell — 384-cell frontend prototype */
const TOTAL_CELLS = 384;
const CELL_PRICE = 20;
const PAYMENT_URL = ""; // Connect a verified checkout backend before accepting payments.
const adoptedCells = {}; // Replace with confirmed adoptions fetched from your server.
let selectedCellNumber = null;
const $ = id => document.getElementById(id);
const fmt = n => String(n).padStart(3, '0');

function createCells() {
  const array = $('solarArray');
  if (!array) return;
  array.replaceChildren();
  // 8 rows x 48 columns = 384 selectable regions.
  // Coordinates are fitted to the uploaded 390x142 reference image.
  // The real engineering cell boundaries are not documented by this screenshot;
  // these are equal-width selectable regions approximating their positions.
  const rows = 8, columns = 48;
  const imageWidth = 390, imageHeight = 142;
  const topY = 25, bottomY = 117, rearX = 374;
  for (let row = 0; row < rows; row++) {
    const centerY = topY + (row + 0.5) * (bottomY - topY) / rows;
    const distance = Math.abs((row + 0.5) / rows - 0.5) * 2;
    const frontX = 46 + 135 * Math.pow(distance, 1.65);
    const rowWidth = rearX - frontX;
    for (let col = 0; col < columns; col++) {
      const number = row * columns + col + 1;
      const cell = document.createElement('button');
      const adopted = Object.prototype.hasOwnProperty.call(adoptedCells, number);
      cell.type = 'button';
      cell.className = `cell ${adopted ? 'adopted' : 'available'}`;
      cell.dataset.cellNumber = number;
      cell.style.left = `${100 * (frontX + col * rowWidth / columns) / imageWidth}%`;
      cell.style.top = `${100 * (topY + row * (bottomY - topY) / rows) / imageHeight}%`;
      cell.style.width = `${100 * rowWidth / columns / imageWidth}%`;
      cell.style.height = `${100 * (bottomY - topY) / rows / imageHeight}%`;
      cell.setAttribute('aria-label', `Cell ${fmt(number)}, ${adopted ? 'adopted' : 'available'}`);
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
  const adopted = Object.keys(adoptedCells).length;
  if ($('availableCount')) $('availableCount').textContent = TOTAL_CELLS - adopted;
  if ($('adoptedCount')) $('adoptedCount').textContent = adopted;
  if ($('totalCount')) $('totalCount').textContent = TOTAL_CELLS;
}
function showSection(id) {
  ['cellDetails','checkout','adoptedDetails'].forEach(name => {
    if ($(name)) $(name).hidden = name !== id;
  });
}
function openCell(number) {
  selectedCellNumber = number;
  document.querySelectorAll('.cell.selected').forEach(c => c.classList.remove('selected'));
  const button = document.querySelector(`[data-cell-number="${number}"]`);
  if (button) button.classList.add('selected');
  ['selectedCell','checkoutCell','adoptedCellTitle'].forEach(id => {
    if ($(id)) $(id).textContent = `Cell #${fmt(number)}`;
  });
  if ($('selectedText')) $('selectedText').textContent = `Cell #${fmt(number)}`;
  if ($('indicatorDot')) $('indicatorDot').style.background = 'var(--gold)';
  if (Object.prototype.hasOwnProperty.call(adoptedCells, number)) {
    showSection('adoptedDetails');
    if ($('adopterName')) $('adopterName').textContent = adoptedCells[number] || 'Sunseeker Supporter';
  } else showSection('cellDetails');
  $('cellModal').classList.add('active');
  $('cellModal').setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  $('closeModal')?.focus();
}
function closeModal() {
  $('cellModal').classList.remove('active');
  $('cellModal').setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
  document.querySelectorAll('.cell.selected').forEach(c => c.classList.remove('selected'));
  selectedCellNumber = null;
  if ($('selectedText')) $('selectedText').textContent = 'Select a cell';
  if ($('indicatorDot')) $('indicatorDot').style.background = '#8b9690';
  if ($('donorName')) $('donorName').value = '';
  if ($('donorEmail')) $('donorEmail').value = '';
  showSection('cellDetails');
}
function showCheckout() {
  if (!selectedCellNumber || Object.prototype.hasOwnProperty.call(adoptedCells, selectedCellNumber)) return;
  showSection('checkout');
  $('donorName')?.focus();
}
function continueToPayment() {
  const name = $('donorName')?.value.trim();
  const email = $('donorEmail')?.value.trim();
  if (!name) { alert('Please enter a display name.'); $('donorName')?.focus(); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address.'); $('donorEmail')?.focus(); return;
  }
  if (!selectedCellNumber || Object.prototype.hasOwnProperty.call(adoptedCells, selectedCellNumber)) {
    alert('This cell is no longer available.'); return;
  }
  // IMPORTANT: Do not store donor PII in console/localStorage or mark a cell adopted here.
  // A server must atomically reserve the cell, create a payment session with the
  // verified $20 price, and mark adoption only after a signed payment webhook.
  if (!PAYMENT_URL) {
    alert('Payment is not connected yet. Your selection has not been reserved or purchased.');
    return;
  }
  alert('A verified payment integration is required before checkout can open.');
}
$('adoptButton')?.addEventListener('click', showCheckout);
$('paymentButton')?.addEventListener('click', continueToPayment);
$('backButton')?.addEventListener('click', () => showSection('cellDetails'));
$('closeModal')?.addEventListener('click', closeModal);
$('adoptedCloseButton')?.addEventListener('click', closeModal);
$('modalOverlay')?.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('cellModal')?.classList.contains('active')) closeModal();
});
if ($('currentYear')) $('currentYear').textContent = new Date().getFullYear();
createCells();
