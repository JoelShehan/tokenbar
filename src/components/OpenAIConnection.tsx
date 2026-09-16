import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { safeError } from "../services/responseValidation";

type Props = {
  onConnectionChange: () => void;
};

function OpenAIConnection({ onConnectionChange }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadConnectionState = async () => {
      const hasKey = await invoke<boolean>("has_openai_key");

      setConnected(hasKey);
    };

    void loadConnectionState().catch(() => setMessage("Could not read the saved connection."));
  }, []);

  const saveKey = async (event: FormEvent) => {
    event.preventDefault();

    if (!apiKey.trim()) {
      setMessage("Enter an OpenAI Admin API key.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await invoke("save_openai_key", {
        apiKey: apiKey.trim(),
      });

      setApiKey("");
      setConnected(true);
      setMessage("Connected.");
      onConnectionChange();
    } catch (error) {
      setMessage(safeError(error));
    } finally {
      setApiKey("");
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    setMessage("");

    try {
      await invoke("delete_openai_key");
      setConnected(false);
      onConnectionChange();
    } catch (error) {
      setMessage(safeError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="openai-connection">
      <p className="section-description">{connected ? "An API key is saved securely on this device." : "Connect your organization to see API tokens and costs."} This is separate from your ChatGPT subscription.</p>
      <form
        className="openai-form"
        onSubmit={saveKey}
      >
        <input
          className="openai-key-input"
          type="password"
          aria-label="OpenAI organization Admin API key"
          autoComplete="off"
          value={apiKey}
          onChange={(event) =>
            setApiKey(event.target.value)
          }
          placeholder="OpenAI Admin API key"
          disabled={saving}
        />

        <button
          className="openai-button"
          type="submit"
          disabled={saving}
        >
          {saving ? "Please wait…" : connected ? "Update key" : "Connect"}
        </button>

        {connected && (
          <button
            className="openai-button openai-button-muted"
            type="button"
            onClick={disconnect}
            disabled={saving}
          >
            Disconnect
          </button>
        )}
      </form>

      {message && (
        <p
          className="openai-message"
          role="status"
          data-tauri-drag-region
        >
          {message}
        </p>
      )}
    </section>
  );
}

export default OpenAIConnection;
