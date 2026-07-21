TV TRACKER — ALWAYSDATA DEPLOYMENT
==================================

This package is the private online version of the existing local TV Tracker.
Do not put passwords, database credentials, the TMDB key, or SECRET_KEY in files.
They belong in the alwaysdata site's Environment field.

Expected remote directory:
/home/YOUR_ACCOUNT/www/tv-tracker

Required environment variables:
SECRET_KEY
APP_USERNAME
APP_PASSWORD_HASH
TMDB_API_KEY
DB_HOST
DB_PORT=5432
DB_NAME
DB_USER
DB_PASSWORD

Python setup over SSH:
cd ~/www/tv-tracker
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python tools/generate_secrets.py

alwaysdata site settings:
Type: Python WSGI
Application path: /home/YOUR_ACCOUNT/www/tv-tracker/wsgi.py
Working directory: /home/YOUR_ACCOUNT/www/tv-tracker
Virtualenv directory: /home/YOUR_ACCOUNT/www/tv-tracker/.venv
Python version: 3.12
Redirect HTTP to HTTPS: enabled
WAF: enabled after the site works

The first login opens an empty tracker. Use Settings > Data > Import App Backup JSON
and select your latest tv-tracker-app-backup JSON. The browser will send a one-time
initial import to PostgreSQL. Thereafter only changed records are synchronized.

The app is deliberately excluded from search engines and requires login.
