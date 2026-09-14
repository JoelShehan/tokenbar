import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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

    loadConnectionState();
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

      const valid =
        await invoke<boolean>("validate_openai_key");

      if (!valid) {
        await invoke("delete_openai_key");

        setConnected(false);
        setMessage(
          "Invalid key or missing organization admin access."
        );
        onConnectionChange();

        return;
      }

      setApiKey("");
      setConnected(true);
      setMessage("Connected.");
      onConnectionChange();
    } catch (error) {
      setConnected(false);
      setMessage(String(error));
    } finally {
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
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="openai-connection">
      <form
        className="openai-form"
        onSubmit={saveKey}
      >
        <input
          className="openai-key-input"
          type="password"
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
          {connected ? "Update" : "Connect"}
        </button>

        {connected && (
          <button
            className="openai-button openai-button-muted"
            type="button"
            onClick={disconnect}
            disabled={saving}
          >
            Remove
          </button>
        )}
      </form>

      {message && (
        <p
          className="openai-message"
          data-tauri-drag-region
        >
          {message}
        </p>
      )}
    </section>
  );
}

export default OpenAIConnection;
