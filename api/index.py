"""
Vercel Serverless Function entry point for СТО Спецмаш CRM.
Exposes the FastAPI `app` instance for Vercel deployment.
"""
import sys
import os

# Ensure the project root directory is on the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import the main FastAPI app from server.py
from server import app

# Production release: v1.2.2 stable restored
# Vercel automatically routes requests to this `app` callable
