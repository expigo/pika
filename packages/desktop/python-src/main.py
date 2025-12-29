"""
Pika! Analysis Sidecar
A FastAPI application that provides audio analysis endpoints.
Spawned by Tauri as a sidecar process.

Note: All librosa/audio processing logic is in audio_processing.py
"""

import argparse
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from audio_processing import AnalysisResult, analyze_audio_file

# Version
VERSION = "0.2.0"

# Global to store the port for the startup event
_port: int = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup: Print ready message AFTER server is listening
    print(f"SIDECAR_READY port={_port}", flush=True)
    yield
    # Shutdown: cleanup if needed
    print("SIDECAR_SHUTDOWN", flush=True)


app = FastAPI(
    title="Pika! Analysis Sidecar",
    description="Audio analysis engine for Pika! Desktop",
    version=VERSION,
    lifespan=lifespan,
)

# Add CORS middleware to allow requests from Tauri webview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (Tauri uses tauri://localhost)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Routes
# =============================================================================


@app.get("/health")
async def health_check():
    """Health check endpoint for sidecar status monitoring."""
    return {"status": "running", "version": VERSION}


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Pika! Analysis Sidecar",
        "version": VERSION,
        "endpoints": ["/health", "/analyze"],
    }


@app.get("/analyze", response_model=AnalysisResult)
async def analyze(path: str = Query(..., description="Path to the audio file")):
    """
    Analyze an audio file and return comprehensive metrics.
    
    Returns:
        Core metrics:
        - bpm: Beats per minute
        - energy: Overall loudness (0-100)
        - key: Musical key (e.g., "Am", "C")
        
        Fingerprint metrics:
        - danceability: Rhythmic stability (0-100)
        - brightness: Treble presence (0-100)
        - acousticness: Acoustic vs electronic (0-100)
        - groove: Percussive punch (0-100)
    """
    return analyze_audio_file(path)


# =============================================================================
# Entry Point
# =============================================================================


def main():
    global _port

    parser = argparse.ArgumentParser(description="Pika! Analysis Sidecar")
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help="Port to run the server on",
    )
    args = parser.parse_args()
    _port = args.port

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="warning",  # Reduce noise, errors go to stderr
    )


if __name__ == "__main__":
    main()
