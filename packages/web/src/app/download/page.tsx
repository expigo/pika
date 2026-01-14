"use client";

import { ArrowLeft, Download, Monitor } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DownloadPage() {
  const [release, setRelease] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLatestRelease() {
      try {
        // Fetch *all* releases and take the first one.
        // This ensures check works even for "Pre-releases" (like alphas/betas)
        // which are often ignored by the /latest endpoint.
        const response = await fetch(
          "https://api.github.com/repos/expigo/pika/releases?per_page=1",
        );
        if (response.ok) {
          const data = await response.json();
          // data is an array, take the first item
          if (data && data.length > 0) {
            setRelease(data[0]);
          }
        }
      } catch (e) {
        console.error("Failed to fetch release:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchLatestRelease();
  }, []);

  const getAssetUrl = (extension: string) => {
    return release?.assets?.find((asset: any) => asset.name.endsWith(extension))
      ?.browser_download_url;
  };

  const macUrl = getAssetUrl(".dmg");
  const winUrl = getAssetUrl(".exe") || getAssetUrl(".msi");
  const linuxUrl = getAssetUrl(".AppImage") || getAssetUrl(".deb");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-12 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[80px]" />
      </div>

      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-2xl mb-8 border border-purple-500/20 shadow-lg shadow-purple-900/20">
          <Monitor className="w-12 h-12 text-purple-400" />
        </div>

        <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight">
          Get Pika! for Desktop
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          The lightweight sidecar that powers your live sets. Integrates seamlessly with VirtualDJ.
        </p>

        <div className="flex flex-col items-center gap-6">
          {!loading && release ? (
            <div className="grid gap-4 w-full max-w-sm">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-200 mb-2">
                <strong>Heads up:</strong> This is a preview release ({release.tag_name}). Please
                report any issues you find!
              </div>

              {/* macOS */}
              <a
                href={macUrl || "#"}
                className={`group bg-white text-slate-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-200 transition-colors flex items-center justify-between shadow-xl shadow-white/5 ${
                  !macUrl && "opacity-50 cursor-not-allowed"
                }`}
                title={macUrl ? "Download for macOS" : "Not available yet"}
                onClick={(e) => !macUrl && e.preventDefault()}
              >
                <span className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-purple-600" />
                  macOS (.dmg)
                </span>
                <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  Universal
                </span>
              </a>

              {/* Windows */}
              <a
                href={winUrl || "#"}
                className={`group bg-slate-800 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-700 border border-slate-700 transition-colors flex items-center justify-between ${
                  !winUrl && "opacity-50 cursor-not-allowed"
                }`}
                title={winUrl ? "Download for Windows" : "Not available yet"}
                onClick={(e) => !winUrl && e.preventDefault()}
              >
                <span className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-blue-400" />
                  Windows (.exe)
                </span>
                <span className="text-xs font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded">
                  x64
                </span>
              </a>

              {/* Linux */}
              <a
                href={linuxUrl || "#"}
                className={`group bg-slate-800 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-700 border border-slate-700 transition-colors flex items-center justify-between ${
                  !linuxUrl && "opacity-50 cursor-not-allowed"
                }`}
                title={linuxUrl ? "Download for Linux" : "Not available yet"}
                onClick={(e) => !linuxUrl && e.preventDefault()}
              >
                <span className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-orange-400" />
                  Linux (AppImage)
                </span>
                <span className="text-xs font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded">
                  Universal
                </span>
              </a>

              <div className="text-xs text-slate-500 mt-2">
                Latest Version: <span className="text-slate-400 font-mono">{release.tag_name}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Fallback / Loading State */}
              <div className="bg-slate-900/50 text-slate-400 px-8 py-6 rounded-xl border border-slate-800 flex flex-col items-center gap-3 backdrop-blur-sm">
                <p className="font-medium">
                  {loading ? "Checking for latest release..." : "No public release found."}
                </p>
                {!loading && (
                  <a
                    href="mailto:hello@pika.stream"
                    className="text-purple-400 hover:text-purple-300 font-bold"
                  >
                    Contact us for Beta Access
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
