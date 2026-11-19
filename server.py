"""Minimal reservation backend. Python 3 standard library; SQLite persists claims.
Run: SUNSEEKER_ADMIN_TOKEN='long-random-secret' python server.py
Production: deploy behind HTTPS, use authentication, rate limiting and backups.
"""
import csv
import hmac
import io
import json
import os
import re
import sqlite3
import smtplib
import ssl
import logging
from email.message import EmailMessage
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('SUNSEEKER_DB', str(ROOT / 'reservations.sqlite3')))
ADMIN_TOKEN = os.environ.get('SUNSEEKER_ADMIN_TOKEN', '')
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '8000'))
PUBLIC_FILES = {
    '/': ('Adoptacell.html', 'text/html; charset=utf-8'),
    '/Adoptacell.html': ('Adoptacell.html', 'text/html; charset=utf-8'),
    '/Adoptacell.css': ('Adoptacell.css', 'text/css; charset=utf-8'),
    '/Adoptacell.js': ('Adoptacell.js', 'text/javascript; charset=utf-8'),
    '/Styles.css': ('Styles.css', 'text/css; charset=utf-8'),
    '/sunseeker-car-reference.png': ('sunseeker-car-reference.png', 'image/png'),
    '/favicon.png': ('favicon.png', 'image/png'),
    '/images/Index/SUN.png': ('images/Index/SUN.png', 'image/png'),
}

def db_connect():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db_connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS reservations (
            cell_number INTEGER PRIMARY KEY CHECK(cell_number BETWEEN 1 AND 384),
            donor_name TEXT NOT NULL,
            donor_email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            display_preference TEXT NOT NULL,
            payment_status TEXT NOT NULL DEFAULT 'pending',
            reserved_at TEXT NOT NULL
        )''')

def notify_team(cell, name, email, preference):
    """Email the team after a committed reservation. Never email from browser code."""
    host = os.environ.get('SUNSEEKER_SMTP_HOST', '').strip()
    username = os.environ.get('SUNSEEKER_SMTP_USER', '').strip()
    password = os.environ.get('SUNSEEKER_SMTP_PASSWORD', '')
    sender = os.environ.get('SUNSEEKER_SMTP_FROM', username).strip()
    recipient = os.environ.get('SUNSEEKER_NOTIFY_TO', 'sunseeker@wmich.edu').strip()
    if not (host and sender):
        logging.warning('Reservation saved, but notification email is not configured')
        return False
    port = int(os.environ.get('SUNSEEKER_SMTP_PORT', '587'))
    msg = EmailMessage()
    msg['Subject'] = f'Sunseeker Adopt a Cell: Reservation #{cell:03d}'
    msg['From'] = sender
    msg['To'] = recipient
    msg.set_content(
        f'New Sunseeker solar cell reservation\n\n'
        f'Cell: #{cell:03d}\nName: {name}\nEmail: {email}\n'
        f'Public display preference: {preference}\n'
        f'Contribution: $20 (NOT YET PAID)\n'
        f'Status: Reserved — follow up for payment\n\n'
        'This email is an internal notification. Do not publish the donor email.'
    )
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=12, context=ssl.create_default_context()) as smtp:
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=12) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logging.error('Reservation saved but email delivery failed: %s', type(exc).__name__)
        return False

class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        raw = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(raw)

    def authorized(self):
        supplied = self.headers.get('Authorization', '')
        return bool(ADMIN_TOKEN) and hmac.compare_digest(supplied, 'Bearer ' + ADMIN_TOKEN)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/cell-reservations':
            with db_connect() as db:
                rows = db.execute('SELECT cell_number, display_name FROM reservations ORDER BY cell_number').fetchall()
            return self.send_json(200, [{'cellNumber': r['cell_number'], 'displayName': r['display_name']} for r in rows])
        if path == '/api/admin/reservations':
            if not self.authorized():
                return self.send_json(401, {'error': 'Unauthorized'})
            with db_connect() as db:
                rows = db.execute('SELECT * FROM reservations ORDER BY cell_number').fetchall()
            return self.send_json(200, [dict(r) for r in rows])
        if path == '/api/admin/reservations.csv':
            if not self.authorized():
                return self.send_json(401, {'error': 'Unauthorized'})
            with db_connect() as db:
                rows = [dict(r) for r in db.execute('SELECT * FROM reservations ORDER BY cell_number')]
            output = io.StringIO()
            writer = csv.writer(output)
            columns = ['cell_number', 'donor_name', 'donor_email', 'display_name', 'display_preference', 'payment_status', 'reserved_at']
            writer.writerow(columns)
            for row in rows:
                writer.writerow([("'" + str(row[c]) if str(row[c]).startswith(('=', '+', '-', '@')) else row[c]) for c in columns])
            raw = output.getvalue().encode('utf-8-sig')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="sunseeker-reservations.csv"')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            return self.wfile.write(raw)
        if path not in PUBLIC_FILES:
            return self.send_error(404)
        filename, content_type = PUBLIC_FILES[path]
        file = ROOT / filename
        if not file.is_file():
            return self.send_error(404, 'Static asset missing')
        raw = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/cell-reservations':
            return self.send_json(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 4096 or 'application/json' not in self.headers.get('Content-Type', ''):
                return self.send_json(400, {'error': 'Invalid request'})
            data = json.loads(self.rfile.read(length))
            cell = data.get('cellNumber')
            name = data.get('donorName')
            email = data.get('donorEmail')
            preference = data.get('displayPreference', 'name')
            if type(cell) is not int or not 1 <= cell <= 384:
                return self.send_json(400, {'error': 'Invalid cell number'})
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
                return self.send_json(400, {'error': 'Please provide a name'})
            if not isinstance(email, str) or len(email) > 150 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip()):
                return self.send_json(400, {'error': 'Please provide a valid email'})
            if preference not in ('name', 'family', 'organization', 'private'):
                return self.send_json(400, {'error': 'Invalid display preference'})
            name, email = name.strip(), email.strip()
            public_name = 'Sunseeker Supporter' if preference == 'private' else name
            with db_connect() as db:
                db.execute('''INSERT INTO reservations
                    (cell_number, donor_name, donor_email, display_name, display_preference, reserved_at)
                    VALUES (?, ?, ?, ?, ?, ?)''',
                    (cell, name, email, public_name, preference, datetime.now(timezone.utc).isoformat()))
            notified = notify_team(cell, name, email, preference)
            return self.send_json(201, {'cellNumber': cell, 'displayName': public_name, 'status': 'reserved', 'paymentStatus': 'pending', 'teamEmailSent': notified})
        except sqlite3.IntegrityError:
            return self.send_json(409, {'error': 'This cell is already reserved. Please choose another.'})
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.send_json(400, {'error': 'Invalid reservation data'})
        except Exception:
            self.log_error('Unexpected reservation failure')
            return self.send_json(500, {'error': 'Reservation unavailable; please try later'})

if __name__ == '__main__':
    init_db()
    print(f'Sunseeker reservations: http://{HOST}:{PORT}')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
