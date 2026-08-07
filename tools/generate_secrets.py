#!/usr/bin/python
from getpass import getpass
import secrets
from argon2 import PasswordHasher

password = getpass("Choose the TV Tracker login password: ")
confirmation = getpass("Repeat the password: ")

if not password:
    raise SystemExit("Password cannot be empty.")
if len(password) < 16:
    raise SystemExit("Password must contain at least 16 characters.")
if password != confirmation:
    raise SystemExit("Passwords do not match.")

print("\nSECRET_KEY=" + secrets.token_urlsafe(48))
print("APP_PASSWORD_HASH=" + PasswordHasher().hash(password))
