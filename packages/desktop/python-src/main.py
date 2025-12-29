"""
Pika! Analysis Sidecar
A FastAPI application that provides audio analysis endpoints.
Spawned by Tauri as a sidecar process.
"""

import argparse
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        "endpoints": ["/health", "/analyze", "/queue"],
    }


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
