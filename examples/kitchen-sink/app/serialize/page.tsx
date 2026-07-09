import { Playground } from "./playground";

export default function SerializePage() {
  return (
    <main>
      <h1>Serialization playground</h1>
      <p className="lede">
        The framework-agnostic core: <code>buildPath</code>,{" "}
        <code>encodeParams</code>, <code>decodeParams</code>,{" "}
        <code>encodeSearch</code>, <code>decodeSearch</code>,{" "}
        <code>buildSearchString</code>, and <code>searchToString</code> — none
        of them touch Next. Edit the inputs and watch the wire form and the
        decoded values (or the branded error) update live.
      </p>
      <Playground />
    </main>
  );
}
