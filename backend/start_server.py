#!/usr/bin/env python3
"""
VF Backend Server - Robust Start Script
Performs pre-flight checks before starting Django server.
"""

import os
import sys
import socket
import time

# Project paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(BASE_DIR, ".venv", "bin", "python")
MANAGE_PY = os.path.join(BASE_DIR, "manage.py")
DB_PATH = os.path.join(BASE_DIR, "db.sqlite3")
DEFAULT_PORT = 5176
DEFAULT_HOST = "0.0.0.0"

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, BASE_DIR)


def check_port_available(port):
    """Check if port is already in use."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("", port))
        sock.close()
        return True
    except OSError:
        sock.close()
        return False


def check_database():
    """Verify database file exists and is accessible."""
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found: {DB_PATH}")
        return False

    size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"[OK] Database: {DB_PATH} ({size_mb:.1f} MB)")

    # Test actual connection
    try:
        import django

        django.setup()
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        print("[OK] Database connection: working")
        return True
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return False


def check_migrations():
    """Ensure all migrations are applied."""
    try:
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("showmigrations", "--plan", stdout=out, no_color=True)
        output = out.getvalue()
        unapplied = [
            line
            for line in output.strip().split("\n")
            if line.strip().startswith("[ ]")
        ]
        if unapplied:
            print(f"[WARN] {len(unapplied)} unapplied migration(s):")
            for m in unapplied[:5]:
                print(f"  {m.strip()}")
            print("[INFO] Running migrations...")
            call_command("migrate", "--no-input")
            print("[OK] Migrations applied")
        else:
            print("[OK] All migrations applied")
        return True
    except Exception as e:
        print(f"[ERROR] Migration check failed: {e}")
        return False


def check_django_system():
    """Run Django system checks."""
    try:
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        err = StringIO()
        call_command("check", stdout=out, stderr=err)
        errors = err.getvalue().strip()
        if errors and "no issues" not in errors.lower():
            print(f"[WARN] System check warnings: {errors[:200]}")
        else:
            print("[OK] Django system check: no issues")
        return True
    except Exception as e:
        print(f"[ERROR] Django system check failed: {e}")
        return False


def kill_existing_server(port):
    """Kill any existing process on the port."""
    try:
        import subprocess

        result = subprocess.run(
            ["fuser", "-k", f"{port}/tcp"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            print(f"[INFO] Killed existing process on port {port}")
            time.sleep(1)
    except Exception:
        pass


def start_server(host=DEFAULT_HOST, port=DEFAULT_PORT):
    """Start the Django development server after all checks pass."""
    print("=" * 50)
    print("VF Backend Server - Pre-flight Checks")
    print("=" * 50)

    # Pre-flight checks
    checks = [
        ("Database", check_database),
        ("Migrations", check_migrations),
        ("System Check", check_django_system),
    ]

    all_passed = True
    for name, check_fn in checks:
        try:
            if not check_fn():
                print(f"[FAIL] {name} check failed")
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {name} check error: {e}")
            all_passed = False

    if not all_passed:
        print("\n[ABORT] Pre-flight checks failed. Fix issues above and retry.")
        sys.exit(1)

    # Check port availability
    if not check_port_available(port):
        print(f"[WARN] Port {port} in use. Attempting to free it...")
        kill_existing_server(port)
        time.sleep(1)
        if not check_port_available(port):
            print(f"[ERROR] Port {port} still in use. Cannot start server.")
            sys.exit(1)

    print("\n" + "=" * 50)
    print(f"[START] Starting server on {host}:{port}")
    print("=" * 50 + "\n")

    # Start server
    from django.core.management import execute_from_command_line

    execute_from_command_line(
        ["manage.py", "runserver", f"{host}:{port}", "--noreload"]
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="VF Backend Server Starter")
    parser.add_argument(
        "--host", default=DEFAULT_HOST, help=f"Host (default: {DEFAULT_HOST})"
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT, help=f"Port (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--no-checks", action="store_true", help="Skip pre-flight checks"
    )
    args = parser.parse_args()

    if args.no_checks:
        import django

        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
        django.setup()
        from django.core.management import execute_from_command_line

        execute_from_command_line(
            ["manage.py", "runserver", f"{args.host}:{args.port}", "--noreload"]
        )
    else:
        start_server(args.host, args.port)
