import { PIKA_VERSION } from "@pika/shared";
import "./App.css";

function App() {
  return (
    <main className="container">
      <h1>Pika! Desktop v{PIKA_VERSION}</h1>
      <p className="subtitle">Your intelligent music library companion</p>
    </main>
  );
}

export default App;
