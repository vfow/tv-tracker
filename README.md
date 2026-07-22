# TV Tracker

Private Flask and PostgreSQL TV tracking website.

## Deployment

1. Commit changes to the private GitHub repository.
2. Connect to alwaysdata with SSH.
3. Run:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

4. When `requirements.txt` changes, run:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

5. Restart the website from the alwaysdata dashboard.

Secrets and exported TV Tracker data must not be committed to GitHub.
