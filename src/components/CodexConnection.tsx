type Props = {
  connected: boolean;
  busy: boolean;
  disconnecting: boolean;
  message: string;
  onConnect: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
};

export default function CodexConnection({ connected, busy, disconnecting, message, onConnect, onCancel, onDisconnect }: Props) {
  return <section className="codex-connection" aria-label="Codex connection">
    <p className="section-description">{disconnecting ? "Disconnecting your account…" : busy ? "Finish signing in in your browser, then return here." : connected ? "Your Codex account is connected." : "Connect your ChatGPT account to see your Codex usage. Everything you need is included."}</p>
    <div className="action-row">
      {disconnecting ? <button disabled>Disconnecting…</button> : busy ? <button onClick={onCancel}>Cancel sign-in</button> : <>
        <button onClick={onConnect}>{connected ? "Switch account" : "Connect Codex"}</button>
        {connected && <button onClick={onDisconnect}>Disconnect Codex</button>}
      </>}
    </div>
    {message && <p className="connection-message" role="status">{message}</p>}
  </section>;
}
