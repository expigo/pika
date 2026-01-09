export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-12">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>

                <div className="space-y-6 text-slate-300">
                    <p>Last updated: January 2026</p>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">1. Overview</h2>
                        <p>
                            Pika! ("we", "our") respects your privacy. We calculate audio metrics locally on the DJ's device.
                            We do not upload audio files to our servers.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">2. Data We Collect</h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>DJs:</strong> Email address (for login), hashed password, and track metadata (Artist, Title, BPM, Key).</li>
                            <li><strong>Dancers:</strong> We do not collect personal data from dancers. Voting and liking is anonymous or session-based.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">3. Cookies</h2>
                        <p>
                            We use local storage to save your "Liked Tracks" history on your device. We use essential cookies for DJ session management.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">4. Contact</h2>
                        <p>
                            For questions, email us at <a href="mailto:hello@pika.stream" className="text-purple-400 hover:underline">hello@pika.stream</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
