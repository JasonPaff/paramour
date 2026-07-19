"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { Field, Select, TextInput, WireListInput } from "./controls";
import {
  ELEMENT_SCALAR_KINDS,
  type ElementDescriptor,
  type ExplorerState,
  type KeyDescriptor,
  omitInput,
  type PresenceDescriptor,
} from "./descriptor";

type ElementKind = ElementDescriptor["kind"];

type KeyKind = KeyDescriptor["kind"];

type PresenceChoice = "default" | "optional" | "required";

/**
 * The config composer (plan-docs-milestone-5 B3): add/remove named keys, per
 * key a `p.*` picker, an element sub-picker for `array`/`csv`, and modifier
 * toggles. Illegal combinations are structurally absent from the controls —
 * an `array` row simply has no presence picker — mirroring the descriptor
 * schema; everything else the builder rejects loudly.
 */
export function Composer({
  onChange,
  state,
}: {
  onChange: (state: ExplorerState) => void;
  state: ExplorerState;
}) {
  function addKey() {
    const taken = new Set(state.keys.map((key) => key.name));
    let index = state.keys.length + 1;
    while (taken.has(`key${String(index)}`)) index += 1;
    onChange({
      ...state,
      keys: [
        ...state.keys,
        { kind: "string", name: `key${String(index)}`, presence: "required" },
      ],
    });
  }

  function patchKey(index: number, next: KeyDescriptor) {
    onChange({ ...state, keys: state.keys.toSpliced(index, 1, next) });
  }

  function removeKey(index: number) {
    const removed = state.keys[index];
    if (removed === undefined) return;
    onChange({
      ...state,
      inputs: omitInput(state.inputs, removed.name),
      keys: state.keys.toSpliced(index, 1),
    });
  }

  function renameKey(index: number, name: string) {
    const previous = state.keys[index];
    if (previous === undefined) return;
    const keys = state.keys.toSpliced(index, 1, { ...previous, name });
    let inputs = state.inputs;
    const moved = inputs[previous.name];
    if (moved !== undefined && !Object.hasOwn(inputs, name)) {
      inputs = { ...omitInput(inputs, previous.name), [name]: moved };
    }
    onChange({ ...state, inputs, keys });
  }

  return (
    <section
      aria-label="Search config composer"
      className="flex flex-col gap-2"
    >
      {state.keys.map((key, index) => (
        <KeyRow
          key={index}
          onPatch={(next) => {
            patchKey(index, next);
          }}
          onRemove={() => {
            removeKey(index);
          }}
          onRename={(name) => {
            renameKey(index, name);
          }}
          value={key}
        />
      ))}
      <Button className="self-start" onClick={addKey} variant="primary">
        + add key
      </Button>
    </section>
  );
}

function ElementPicker({
  element,
  onChange,
}: {
  element: ElementDescriptor;
  onChange: (element: ElementDescriptor) => void;
}) {
  return (
    <>
      <Field label="element">
        <Select
          onChange={(event) => {
            const kind = event.target.value as ElementKind;
            onChange(
              kind === "enum" ? { kind, members: ["one", "two"] } : { kind },
            );
          }}
          value={element.kind}
        >
          {[...ELEMENT_SCALAR_KINDS, "enum"].map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </Field>
      {element.kind === "enum" ? (
        <Field label="element members">
          <MembersInput
            label="element enum members"
            members={element.members}
            onChange={(members) => {
              onChange({ kind: "enum", members });
            }}
          />
        </Field>
      ) : null}
    </>
  );
}

function KeyRow({
  onPatch,
  onRemove,
  onRename,
  value,
}: {
  onPatch: (next: KeyDescriptor) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  value: KeyDescriptor;
}) {
  const presenceChoice: PresenceChoice =
    value.kind === "array"
      ? "required"
      : typeof value.presence === "object"
        ? "default"
        : value.presence;

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-fd-border bg-fd-card p-3">
      <Field label="name">
        <TextInput
          aria-label="key name"
          className="w-28"
          onChange={(event) => {
            onRename(event.target.value);
          }}
          value={value.name}
        />
      </Field>
      <Field label="codec">
        <Select
          aria-label="codec kind"
          onChange={(event) => {
            onPatch(withKind(value, event.target.value as KeyKind));
          }}
          value={value.kind}
        >
          {KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </Field>

      {value.kind === "array" || value.kind === "csv" ? (
        <ElementPicker
          element={value.element}
          onChange={(element) => {
            onPatch({ ...value, element });
          }}
        />
      ) : null}

      {value.kind === "enum" ? (
        <Field label="members">
          <MembersInput
            label={`enum members for ${value.name}`}
            members={value.members}
            onChange={(members) => {
              onPatch({ ...value, members });
            }}
          />
        </Field>
      ) : null}

      {value.kind === "array" ? null : (
        <Field label="presence">
          <Select
            aria-label={`presence for ${value.name}`}
            onChange={(event) => {
              onPatch({
                ...value,
                presence: toPresence(event.target.value as PresenceChoice),
              });
            }}
            value={presenceChoice}
          >
            <option value="required">required</option>
            <option value="optional">.optional()</option>
            <option value="default">.default(…)</option>
          </Select>
        </Field>
      )}

      {value.kind !== "array" && typeof value.presence === "object" ? (
        <Field label="default (wire form)">
          <TextInput
            aria-label={`default wire value for ${value.name}`}
            className="w-28"
            onChange={(event) => {
              onPatch({ ...value, presence: { default: event.target.value } });
            }}
            value={value.presence.default}
          />
        </Field>
      ) : null}

      <Field label=".catch()">
        <div className="flex h-8 items-center">
          <input
            aria-label={`catch recovery for ${value.name}`}
            checked={value.catch !== undefined}
            className="size-4 accent-fd-primary"
            onChange={(event) => {
              if (!event.target.checked) {
                onPatch({ ...value, catch: undefined });
              } else if (value.kind === "array") {
                onPatch({ ...value, catch: [] });
              } else {
                onPatch({ ...value, catch: "" });
              }
            }}
            type="checkbox"
          />
        </div>
      </Field>

      {value.kind !== "array" && value.catch !== undefined ? (
        <Field label="catch fallback (wire form)">
          <TextInput
            aria-label={`catch fallback wire value for ${value.name}`}
            className="w-28"
            onChange={(event) => {
              onPatch({ ...value, catch: event.target.value });
            }}
            value={value.catch}
          />
        </Field>
      ) : null}

      {value.kind === "array" && value.catch !== undefined ? (
        <Field label="catch fallback (element wire forms)">
          <WireListInput
            label={`catch fallback for ${value.name}`}
            onChange={(fallback) => {
              onPatch({ ...value, catch: fallback });
            }}
            values={value.catch}
          />
        </Field>
      ) : null}

      <Button
        aria-label={`Remove key ${value.name}`}
        className="ml-auto"
        onClick={onRemove}
        size="icon"
        variant="ghost"
      >
        ✕
      </Button>
    </div>
  );
}

/**
 * Comma-separated editor for `p.enum` members. The draft text is local state
 * so a trailing comma survives the keystroke; the parsed members flow up
 * immediately, and external changes (back/forward, shared links) resync the
 * draft — the same pattern as kitchen-sink's debounced filter input.
 */
function MembersInput({
  label,
  members,
  onChange,
}: {
  label: string;
  members: readonly string[];
  onChange: (members: string[]) => void;
}) {
  const canonical = members.join(", ");
  const [draft, setDraft] = useState(canonical);
  const lastSent = useRef(canonical);

  useEffect(() => {
    if (canonical !== lastSent.current) {
      lastSent.current = canonical;
      setDraft(canonical);
    }
  }, [canonical]);

  return (
    <TextInput
      aria-label={label}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = text
          .split(",")
          .map((member) => member.trim())
          .filter((member) => member !== "");
        lastSent.current = parsed.join(", ");
        onChange(parsed);
      }}
      placeholder="one, two, three"
      value={draft}
    />
  );
}

const KIND_OPTIONS: readonly KeyKind[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "enum",
  "isoDate",
  "timestamp",
  "index",
  "json",
  "array",
  "csv",
];

function toPresence(choice: PresenceChoice): PresenceDescriptor {
  return choice === "default" ? { default: "" } : choice;
}

/**
 * Rebuilds a descriptor for a new codec kind. Modifier values are dropped on
 * purpose: they are wire-form strings of the OLD codec and would almost never
 * parse under the new one — a fresh row beats an instant error card.
 */
function withKind(previous: KeyDescriptor, kind: KeyKind): KeyDescriptor {
  const name = previous.name;
  switch (kind) {
    case "array":
      return { element: { kind: "string" }, kind, name };
    case "csv":
      return { element: { kind: "string" }, kind, name, presence: "required" };
    case "enum":
      return { kind, members: ["one", "two"], name, presence: "required" };
    default:
      return { kind, name, presence: "required" };
  }
}
