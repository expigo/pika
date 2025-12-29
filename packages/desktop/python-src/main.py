"""
Pika! Analysis Sidecar
A FastAPI application that provides audio analysis endpoints.
Spawned by Tauri as a sidecar process.
"""

import argparse
import os
from contextlib import asynccontextmanager
from typing import Optional

import librosa
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Global to store the port for the startup event
_port: int = 0


class AnalysisResult(BaseModel):
    """Result of audio analysis."""

    bpm: Optional[float] = None
    energy: Optional[float] = None
    key: Optional[str] = None
    error: Optional[str] = None


# Key names for pitch class mapping
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def estimate_key(y: np.ndarray, sr: int) -> str:
    """Estimate the musical key using chroma features."""
    try:
        # Extract chroma features
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        # Sum across time to get pitch class strength
        pitch_class = np.sum(chroma, axis=1)
        # Find the strongest pitch class
        key_idx = int(np.argmax(pitch_class))
        return KEY_NAMES[key_idx]
    except Exception:
        return "Unknown"


def analyze_audio_file(file_path: str) -> AnalysisResult:
    """Analyze an audio file and extract BPM, energy, and key."""
    if not os.path.exists(file_path):
        return AnalysisResult(error=f"File not found: {file_path}")

    try:
        # Load the audio file (30 seconds max for faster analysis)
        y, sr = librosa.load(file_path, duration=30, sr=22050)

        # Estimate BPM
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0])

        # Calculate RMS energy (normalized 0-1)
        rms = librosa.feature.rms(y=y)
        energy = float(np.mean(rms))
        # Normalize energy to 0-100 range (rough approximation)
        energy = min(100.0, energy * 500)

        # Estimate key
        key = estimate_key(y, sr)

        return AnalysisResult(bpm=round(bpm, 1), energy=round(energy, 1), key=key)

    except Exception as e:
        return AnalysisResult(error=str(e))


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
    version="0.1.0",
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


@app.get("/health")
async def health_check():
    """Health check endpoint for sidecar status monitoring."""
    return {"status": "running", "version": "python 3.12"}


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Pika! Analysis Sidecar",
        "version": "0.1.0",
        "endpoints": ["/health", "/analyze"],
    }


@app.get("/analyze", response_model=AnalysisResult)
async def analyze(path: str = Query(..., description="Path to the audio file")):
    """Analyze an audio file and return BPM, energy, and key."""
    result = analyze_audio_file(path)

    if result.error:
        # Return error in response body, not as HTTP error
        # This allows the frontend to handle it gracefully
        return result

    return result


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
        log_level="info",
    )


if __name__ == "__main__":
    main()

