// Firebase Firestore shared reservations — GitHub Pages compatible.
// Paste ONLY the public Firebase web app config below. Do not use Admin SDK keys.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, doc, onSnapshot, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBxTRmHKXJoKyJq7PK_pifrFC49Dl17rNo',
  authDomain: 'sunseeker-adopt-a-ce.firebaseapp.com',
  projectId: 'sunseeker-adopt-a-ce',
  storageBucket: 'sunseeker-adopt-a-ce.firebasestorage.app',
  messagingSenderId: '709916570050',
  appId: '1:709916570050:web:3c737630692783f097265b',
  measurementId: 'G-QF8533PDQS'
};
const configured = !Object.values(firebaseConfig).some(v => v.startsWith('PASTE_'));
const TOTAL_CELLS = 384;
const reservedCells = {};
let selectedCellNumber = null;
let ready = false;
let db = null;
let auth = null;
const $ = id => document.getElementById(id);
const fmt = n => String(n).padStart(3, '0');
const hasReservation = n => Object.prototype.hasOwnProperty.call(reservedCells,n);

function message(text) {
  let el = $('reservationError');
  if (!el) { el = document.createElement('p'); el.id='reservationError'; el.className='reservation-error'; $('checkout')?.prepend(el); }
  el.textContent = text; el.hidden = false;
}
function updateCounts() {
  $('availableCount').textContent = ready ? TOTAL_CELLS-Object.keys(reservedCells).length : '—';
  $('adoptedCount').textContent = ready ? Object.keys(reservedCells).length : '—';
}
function createCells() {
  const array = $('solarArray'); if (!array) return;
  array.replaceChildren();
  for (let row=0;row<8;row++) {
    const distance=Math.abs((row+.5)/8-.5)*2;
    const frontX=46+135*Math.pow(distance,1.65);
    const width=374-frontX;
    for(let col=0;col<48;col++) {
      const n=row*48+col+1;
      const cell=document.createElement('button');
      cell.type='button'; cell.className=`cell ${hasReservation(n)?'adopted':'available'}`;
      cell.dataset.cellNumber=n;
      cell.style.left=`${100*(frontX+col*width/48)/390}%`;
      cell.style.top=`${100*(25+row*92/8)/142}%`;
      cell.style.width=`${100*width/48/390}%`;
      cell.style.height=`${100*92/8/142}%`;
      cell.setAttribute('aria-label',`Cell ${fmt(n)}, ${hasReservation(n)?'reserved':'available'}`);
      const label=document.createElement('span');label.className='cell-number';label.textContent=fmt(n);cell.append(label);
      cell.addEventListener('click',()=>openCell(n));array.append(cell);
    }
  }
  updateCounts();
}
function showSection(id) {
  ['cellDetails','checkout','adoptedDetails'].forEach(x=>{if($(x))$(x).hidden=x!==id;});
}
function openCell(n) {
  selectedCellNumber=n;
  document.querySelectorAll('.cell.selected').forEach(c=>c.classList.remove('selected'));
  document.querySelector(`[data-cell-number="${n}"]`)?.classList.add('selected');
  ['selectedCell','checkoutCell','adoptedCellTitle'].forEach(id=>{if($(id))$(id).textContent=`Cell #${fmt(n)}`;});
  if($('selectedText'))$('selectedText').textContent=`Cell #${fmt(n)}`;
  if($('indicatorDot'))$('indicatorDot').style.background='var(--ad-gold)';
  if(hasReservation(n)) {showSection('adoptedDetails');$('adopterName').textContent=reservedCells[n];}
  else showSection('cellDetails');
  $('cellModal').classList.add('active');$('cellModal').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';$('closeModal')?.focus();
}
function closeModal() {
  $('cellModal').classList.remove('active');$('cellModal').setAttribute('aria-hidden','true');
  document.body.style.overflow='';document.querySelectorAll('.cell.selected').forEach(c=>c.classList.remove('selected'));
  selectedCellNumber=null;if($('selectedText'))$('selectedText').textContent='Select a cell';
  ['donorName','donorEmail','displayName','dedication'].forEach(id=>{if($(id))$(id).value='';});if($('reservationError'))$('reservationError').hidden=true;
  showSection('cellDetails');
}
function showCheckout() {
  if(!selectedCellNumber||hasReservation(selectedCellNumber))return;
  showSection('checkout');$('donorName')?.focus();
  if(!ready)message('Connecting to shared reservations. Please wait and try again.');
}
async function reserveCell() {
  const name=$('donorName')?.value.trim();
  const email=$('donorEmail')?.value.trim();
  const displayName=$('displayName')?.value.trim() || name;
  const dedication=$('dedication')?.value.trim() || '';
  const publicName=$('displayPreference')?.value==='public';
  const n=selectedCellNumber;
  
if ($('reservationError')) $('reservationError').hidden = true;

if (!name || name.length > 100)
  return message('Enter your full name (1–100 characters).');

if (!email || email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return message('Enter a valid email address.');

if (displayName.length > 100 || dedication.length > 200)
  return message('Please shorten your display name or dedication.');

if (!ready || !db || !auth?.currentUser)
  return message('Shared reservations are not connected yet. No reservation was saved.');

if (!n || hasReservation(n))
  return message('This cell is already reserved. Please select another.');

const btn = $('paymentButton');
btn.disabled = true;

  try {
    const id=fmt(n);
    const batch=writeBatch(db);
    // Atomic paired creates: either BOTH public and private docs are created, or neither.
    batch.set(doc(db,'cellReservations',id),{
      cellNumber:n,
      displayName:publicName?displayName:'Anonymous Sunseeker Supporter',
      createdAt:serverTimestamp()
    });
    batch.set(doc(db,'reservationContacts',id),{
      cellNumber:n, ownerUid:auth.currentUser.uid, fullName:name,
      email, requestedDisplayName:displayName, dedication,
      showName:publicName, paymentStatus:'pending', createdAt:serverTimestamp()
    });
    await batch.commit();
    reservedCells[n]=publicName?displayName:'Anonymous Sunseeker Supporter';
    createCells();closeModal();
    alert(`Cell #${id} is reserved! No payment has been collected. Sunseeker can follow up by email.`);
  } catch(err) {
    console.error('Reservation error',err);
    message(err.code==='permission-denied'?'Reservation could not be completed. The cell may have been taken, or the Firebase rules need updating.':'Could not save the reservation. Check your connection and try again.');
  } finally {btn.disabled=false;}
}
$('adoptButton')?.addEventListener('click',showCheckout);
$('paymentButton')?.addEventListener('click',reserveCell);
$('backButton')?.addEventListener('click',()=>showSection('cellDetails'));
$('closeModal')?.addEventListener('click',closeModal);
$('adoptedCloseButton')?.addEventListener('click',closeModal);
$('modalOverlay')?.addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('cellModal')?.classList.contains('active'))closeModal();});
if($('currentYear'))$('currentYear').textContent=new Date().getFullYear();
createCells();
if (configured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    signInAnonymously(auth).then(() => {
      onSnapshot(collection(db, 'cellReservations'), snapshot => {
        Object.keys(reservedCells).forEach(k => delete reservedCells[k]);
        snapshot.forEach(d => {
          const x = d.data();
          if (Number.isInteger(x.cellNumber) && x.cellNumber >= 1 && x.cellNumber <= 384 && typeof x.displayName === 'string') {
            reservedCells[x.cellNumber] = x.displayName;
          }
        });
        ready = true;
        createCells();
      }, error => {
        console.error('Firestore connection failed', error);
        ready = false;
        updateCounts();
      });
    }).catch(error => {
      console.error('Anonymous authentication failed', error);
      ready = false;
      updateCounts();
    });
  } catch(error) {
    console.error('Firebase initialization failed', error);
  }
}
