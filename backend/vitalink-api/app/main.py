"""
VitaLink Backend — FastAPI application entry point.

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from app import config
from app.database import test_supabase_connection
from app.gemini_client import test_gemini_connection
from app.routes import care_plans, check_ins, health_reports, patients, reports, vitals

app = FastAPI(
    title="VitaLink Backend",
    description=(
        "API for check-ins, vitals, Gemini health analysis, "
        "and family dashboard reports."
    ),
    version="0.1.0",
)

# Allow frontend (Person 4) and other teammates' apps to call this API.
# Tighten allow_origins for production later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(care_plans.router)
app.include_router(check_ins.router)
app.include_router(vitals.router)
app.include_router(health_reports.router)
app.include_router(reports.router)


@app.get("/")
async def root():
    """Simple health check so teammates can confirm the API is running."""
    return {
        "service": "VitaLink Backend",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Lightweight readiness endpoint for demos and monitoring."""
    return {"status": "healthy"}


@app.get("/supabase-test")
async def supabase_test(request: Request, format: str | None = None):
    """
    Verify that this backend can connect to your Supabase project.

    Browsers get a simple HTML status page (easier to read than raw JSON).
    Use ?format=json or Accept: application/json for JSON.
    """
    result = test_supabase_connection()

    # Safe diagnostics only — never include secret values
    env_info = config.supabase_env_status()
    payload = {**result, "env_check": env_info}

    accept = request.headers.get("accept") or ""
    wants_json = (format or "").lower() == "json" or (
        "application/json" in accept and "text/html" not in accept
    )
    wants_html = (not wants_json) and ("text/html" in accept or format is None)
    if wants_html:
        ok = bool(result.get("ok"))
        color = "#0a7a32" if ok else "#b00020"
        title = "Supabase connection OK" if ok else "Supabase connection failed"
        error_line = result.get("error") or ""
        hint = result.get("hint") or (
            "Edit <code>.env</code> in the project root, replace the example "
            "SUPABASE_URL and SUPABASE_KEY with real values from "
            "Supabase &gt; Project Settings &gt; API, then <strong>save the file "
            "(Cmd+S)</strong> and refresh this page."
        )
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VitaLink Supabase Test</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 40rem;
           margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }}
    .status {{ color: {color}; font-size: 1.4rem; font-weight: 700; }}
    code {{ background: #f2f2f2; padding: 0.1rem 0.35rem; border-radius: 4px; }}
    ul {{ padding-left: 1.2rem; }}
  </style>
</head>
<body>
  <p class="status">{title}</p>
  <p>{result.get("message", "")}</p>
  {"<p><strong>Error:</strong> " + error_line + "</p>" if error_line else ""}
  <p>{hint if not ok else result.get("hint", "")}</p>
  <h3>Environment check (no secrets shown)</h3>
  <ul>
    <li>python-dotenv installed: <code>{env_info["dotenv_installed"]}</code></li>
    <li>load_dotenv() called: <code>{env_info["load_dotenv_called"]}</code></li>
    <li>.env path: <code>{env_info["env_file_path"]}</code></li>
    <li>.env exists: <code>{env_info["env_file_exists"]}</code></li>
    <li>SUPABASE_URL loaded: <code>{env_info["supabase_url_loaded"]}</code></li>
    <li>SUPABASE_KEY loaded: <code>{env_info["supabase_key_loaded"]}</code></li>
    <li>URL is still .env.example placeholder: <code>{env_info["supabase_url_is_placeholder"]}</code></li>
    <li>Key is still .env.example placeholder: <code>{env_info["supabase_key_is_placeholder"]}</code></li>
  </ul>
  <p>JSON version: <a href="/supabase-test?format=json">/supabase-test?format=json</a>
     · Docs: <a href="/docs">/docs</a></p>
</body>
</html>"""
        return HTMLResponse(content=html)

    return JSONResponse(content=payload)



@app.get("/supabase-test/")
async def supabase_test_trailing_slash(request: Request):
    """Same as /supabase-test (avoids confusion with trailing slash)."""
    return await supabase_test(request)


@app.get("/gemini-test")
async def gemini_test(request: Request, format: str | None = None):
    """
    Verify that this backend can call Google Gemini with GEMINI_API_KEY.

    Browsers get a simple HTML status page.
    Use ?format=json for JSON. The API key is never included in the response.
    """
    result = test_gemini_connection()
    env_check = result.get("env_check") or {}

    accept = request.headers.get("accept") or ""
    wants_json = (format or "").lower() == "json" or (
        "application/json" in accept and "text/html" not in accept
    )
    wants_html = (not wants_json) and ("text/html" in accept or format is None)

    if wants_html:
        ok = bool(result.get("ok"))
        color = "#0a7a32" if ok else "#b00020"
        title = "Gemini connection OK" if ok else "Gemini connection failed"
        error_line = result.get("error") or ""
        reply = result.get("response") or ""
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VitaLink Gemini Test</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 40rem;
           margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }}
    .status {{ color: {color}; font-size: 1.4rem; font-weight: 700; }}
    code {{ background: #f2f2f2; padding: 0.1rem 0.35rem; border-radius: 4px; }}
    .box {{ background: #f7f7f7; padding: 0.75rem 1rem; border-radius: 8px; }}
  </style>
</head>
<body>
  <p class="status">{title}</p>
  <p>{result.get("message", "")}</p>
  <p>Model: <code>{result.get("model", "")}</code></p>
  {"<p><strong>Error:</strong> " + error_line + "</p>" if error_line else ""}
  {"<p><strong>Gemini said:</strong></p><div class='box'>" + reply + "</div>" if reply else ""}
  <h3>Environment check (no secrets shown)</h3>
  <ul>
    <li>GEMINI_API_KEY loaded: <code>{env_check.get("gemini_api_key_loaded")}</code></li>
    <li>Key is still placeholder: <code>{env_check.get("gemini_api_key_is_placeholder")}</code></li>
    <li>Model: <code>{env_check.get("gemini_model")}</code></li>
  </ul>
  <p>JSON: <a href="/gemini-test?format=json">/gemini-test?format=json</a>
     · Docs: <a href="/docs">/docs</a></p>
</body>
</html>"""
        return HTMLResponse(content=html)

    return JSONResponse(content=result)


@app.get("/gemini-test/")
async def gemini_test_trailing_slash(request: Request, format: str | None = None):
    """Same as /gemini-test (avoids confusion with trailing slash)."""
    return await gemini_test(request, format=format)
