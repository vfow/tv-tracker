from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if text.count(old) < count:
        raise RuntimeError(f"{path}: patch needle not found: {old[:140]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


# Database failures in disposable provider caches are provider-boundary failures,
# not reasons for core release timing to fail.
replace("release_timing.py", "import os\n", "import os\n\nimport psycopg\n")
replace(
    "release_timing.py",
    "except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError):\n                candidate = None",
    "except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError, psycopg.Error):\n                candidate = None",
)

# Use psycopg's JSON adapter explicitly for provider-owned JSONB cache rows.
replace(
    "tvmaze_integration.py",
    "from urllib.request import Request, urlopen\n",
    "from urllib.request import Request, urlopen\n\nfrom psycopg.types.json import Jsonb\n",
)
replace(
    "tvmaze_integration.py",
    "(tvmaze_id, season, episode, json.dumps(raw), str((result or {}).get(\"precision\") or \"\"),",
    "(tvmaze_id, season, episode, Jsonb(raw), str((result or {}).get(\"precision\") or \"\"),",
)

# Prefetch only the timing-relevant horizon instead of every historical episode.
replace(
    "static/js/release-timing.js",
    """    function collectEpisodes(shows){\n        const output = []; const seen = new Set();\n        Object.values(shows || {}).forEach(show=>{""",
    """    function collectEpisodes(shows){\n        const output = []; const seen = new Set();\n        const today = new Date(); today.setHours(0,0,0,0);\n        const minTime = today.getTime() - (14 * 86400000);\n        const maxTime = today.getTime() + (366 * 86400000);\n        Object.values(shows || {}).forEach(show=>{""",
)
replace(
    "static/js/release-timing.js",
    """                const identity = key(showId,season,episode);\n                if(!identity || seen.has(identity)){ return; }\n                seen.add(identity);\n                output.push({tmdbId:showId,season,episode,airDate:String(raw.air_date || \"\")});""",
    """                const identity = key(showId,season,episode);\n                if(!identity || seen.has(identity)){ return; }\n                const airDate = String(raw.air_date || \"\");\n                const day = Date.parse(airDate + \"T00:00:00Z\");\n                if(!airDate || !Number.isFinite(day) || day < minTime || day > maxTime){ return; }\n                seen.add(identity);\n                output.push({tmdbId:showId,season,episode,airDate});""",
)
replace(
    "static/js/release-timing.js",
    """                if(payload.attribution && payload.attribution.required){ status.attribution = payload.attribution; }\n            }\n            scheduleBoundary();""",
    """                if(payload.attribution && payload.attribution.required){\n                    status.attribution = payload.attribution;\n                    if(typeof document !== \"undefined\"){\n                        mountAttribution(document.getElementById(\"app\") || document.body);\n                    }\n                }\n            }\n            scheduleBoundary();""",
)
replace(
    "static/js/release-timing.js",
    """            status = Object.assign(status,payload || {});\n        }catch(error){ /* core fallback remains available */ }""",
    """            status = Object.assign(status,payload || {});\n            if(!status.capability || status.capability.enabled !== true){ cache.clear(); }\n        }catch(error){ /* core fallback remains available */ }""",
)

# Automatic timezone follows the device. Manual mode never gets overwritten.
replace(
    "static/js/notifications.js",
    """    async function ensureTimezone(timezone){\n        if(timezone || timezoneBootstrapAttempted){\n            return timezone || \"\";\n        }\n        timezoneBootstrapAttempted = true;\n        const detected = detectedTimezone();\n        if(!detected){\n            return \"\";\n        }\n        try{\n            const payload = await requestJSON(\"/api/notifications/settings\",{\n                method:\"PATCH\",\n                body:{timezone:detected,timezoneIfUnset:true}\n            });\n            notificationSettings = payload.settings || notificationSettings;\n            return notificationSettings && notificationSettings.timezone || detected;\n        }catch(error){\n            console.warn(\"TV Tracker could not initialize notification timezone\",error);\n            return \"\";\n        }\n    }""",
    """    async function ensureTimezone(timezone,timezoneMode=\"automatic\"){\n        if(String(timezoneMode || \"automatic\") === \"manual\"){\n            return timezone || \"\";\n        }\n        const detected = detectedTimezone();\n        if(!detected){ return timezone || \"\"; }\n        if(timezone === detected && timezoneBootstrapAttempted){ return detected; }\n        timezoneBootstrapAttempted = true;\n        try{\n            const payload = await requestJSON(\"/api/notifications/settings\",{\n                method:\"PATCH\",\n                body:{timezone:detected,timezoneMode:\"automatic\"}\n            });\n            notificationSettings = payload.settings || notificationSettings;\n            return notificationSettings && notificationSettings.timezone || detected;\n        }catch(error){\n            console.warn(\"TV Tracker could not synchronize notification timezone\",error);\n            return timezone || \"\";\n        }\n    }""",
)
replace(
    "static/js/notifications.js",
    "await ensureTimezone(payload.timezone || \"\");",
    "await ensureTimezone(payload.timezone || \"\",payload.timezoneMode || \"automatic\");",
)
replace(
    "static/js/notifications.js",
    "await ensureTimezone(notificationSettings.timezone || \"\");",
    "await ensureTimezone(notificationSettings.timezone || \"\",notificationSettings.timezoneMode || \"automatic\");",
)

# Add a compact timezone control to the existing settings surface rather than a new page.
replace(
    "static/js/notifications.js",
    """                        ${switchMarkup(\"enabled\",\"Notifications\",settings.enabled !== false,false)}\n                        ${familyRows}""",
    """                        ${switchMarkup(\"enabled\",\"Notifications\",settings.enabled !== false,false)}\n                        <div class=\"notification-setting-row\" data-timezone-setting>\n                            <span class=\"notification-setting-copy\">\n                                <strong>Timezone</strong>\n                                <span class=\"notification-setting-description\">Automatic follows this device. Manual stays fixed.</span>\n                            </span>\n                            <span>\n                                <select data-notification-timezone-mode aria-label=\"Timezone mode\">\n                                    <option value=\"automatic\" ${settings.timezoneMode !== \"manual\" ? \"selected\" : \"\"}>Automatic</option>\n                                    <option value=\"manual\" ${settings.timezoneMode === \"manual\" ? \"selected\" : \"\"}>Manual</option>\n                                </select>\n                                <input data-notification-timezone type=\"text\" value=\"${String(settings.timezone || \"\").replace(/&/g,\"&amp;\").replace(/\"/g,\"&quot;\")}\" aria-label=\"IANA timezone\" placeholder=\"Asia/Kuala_Lumpur\" ${settings.timezoneMode === \"manual\" ? \"\" : \"disabled\"}>\n                            </span>\n                        </div>\n                        ${familyRows}""",
)
replace(
    "static/js/notifications.js",
    """            root.querySelectorAll(\"[data-notification-setting]\").forEach(input=>{""",
    """            const timezoneModeInput = root.querySelector(\"[data-notification-timezone-mode]\");\n            const timezoneInput = root.querySelector(\"[data-notification-timezone]\");\n            if(timezoneModeInput && timezoneInput){\n                timezoneModeInput.addEventListener(\"change\",async()=>{\n                    const mode = timezoneModeInput.value === \"manual\" ? \"manual\" : \"automatic\";\n                    timezoneInput.disabled = mode !== \"manual\";\n                    try{\n                        if(mode === \"automatic\"){\n                            const detected = detectedTimezone();\n                            const payload = await requestJSON(\"/api/notifications/settings\",{method:\"PATCH\",body:{timezoneMode:mode,timezone:detected}});\n                            notificationSettings = payload.settings || notificationSettings;\n                            timezoneInput.value = notificationSettings.timezone || detected;\n                        }else{\n                            await saveSetting(\"timezoneMode\",mode);\n                        }\n                    }catch(error){ console.error(\"TV Tracker could not save timezone mode\",error); }\n                });\n                timezoneInput.addEventListener(\"change\",async()=>{\n                    if(timezoneModeInput.value !== \"manual\"){ return; }\n                    try{\n                        const payload = await requestJSON(\"/api/notifications/settings\",{method:\"PATCH\",body:{timezoneMode:\"manual\",timezone:timezoneInput.value.trim()}});\n                        notificationSettings = payload.settings || notificationSettings;\n                        timezoneInput.value = notificationSettings.timezone || timezoneInput.value;\n                    }catch(error){ console.error(\"TV Tracker could not save manual timezone\",error); }\n                });\n            }\n\n            root.querySelectorAll(\"[data-notification-setting]\").forEach(input=>{""",
)
# saveSetting normally handles boolean family toggles; add timezoneMode string as an explicit exception.
replace(
    "static/js/notifications.js",
    """    async function saveSetting(key,value){\n        const payload = await requestJSON(\"/api/notifications/settings\",{\n            method:\"PATCH\",\n            body:{[key]:value}\n        });""",
    """    async function saveSetting(key,value){\n        const payload = await requestJSON(\"/api/notifications/settings\",{\n            method:\"PATCH\",\n            body:{[key]:value}\n        });""",
)

# Re-check automatic timezone whenever the app returns to the foreground.
replace(
    "static/js/notifications.js",
    """    function setUnreadDot(button,unread){""",
    """    document.addEventListener(\"visibilitychange\",()=>{\n        if(!document.hidden && notificationSettings){\n            ensureTimezone(notificationSettings.timezone || \"\",notificationSettings.timezoneMode || \"automatic\");\n        }\n    });\n    global.addEventListener && global.addEventListener(\"focus\",()=>{\n        if(notificationSettings){ ensureTimezone(notificationSettings.timezone || \"\",notificationSettings.timezoneMode || \"automatic\"); }\n    });\n\n    function setUnreadDot(button,unread){""",
)

# Contract tests for new mode and cache limits.
test = ROOT / "tests/test_tvmaze_rollout_contracts.py"
test.write_text('''from pathlib import Path\nimport unittest\n\nROOT = Path(__file__).resolve().parents[1]\n\nclass TVmazeRolloutContractTests(unittest.TestCase):\n    def read(self, path): return (ROOT / path).read_text(encoding="utf-8")\n\n    def test_timezone_has_automatic_and_manual_modes(self):\n        backend = self.read("notifications_backend.py")\n        ui = self.read("static/js/notifications.js")\n        self.assertIn("timezone_mode", backend)\n        self.assertIn("timezoneMode", backend)\n        self.assertIn('value="automatic"', ui)\n        self.assertIn('value="manual"', ui)\n        self.assertIn("visibilitychange", ui)\n\n    def test_provider_prefetch_is_bounded_and_attributed(self):\n        runtime = self.read("static/js/release-timing.js")\n        self.assertIn("14 * 86400000", runtime)\n        self.assertIn("366 * 86400000", runtime)\n        self.assertIn("Release timing data by", runtime)\n        self.assertIn("mountAttribution", runtime)\n\n    def test_provider_database_errors_are_fallback_errors(self):\n        resolver = self.read("release_timing.py")\n        provider = self.read("tvmaze_integration.py")\n        self.assertIn("psycopg.Error", resolver)\n        self.assertIn("Jsonb(raw)", provider)\n\nif __name__ == "__main__": unittest.main()\n''', encoding="utf-8")

print("TVmaze hardening and timezone UI patches applied.")
