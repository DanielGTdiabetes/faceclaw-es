import { CloudSttClient, CloudSttOptions } from "./cloud-stt";
import { openSocket, type SocketConnection } from "./socket";

/**
 * Self-hosted speech-to-text on the user's EVO-X2 ("even"), reached over
 * Tailscale. The server is NeMo-Speech.cpp's realtime WebSocket
 * (/v1/audio/transcriptions/realtime) running a local model, so no audio
 * leaves the user's own machines and nothing is billed.
 *
 * Its event names match OpenAI's realtime transcription, but the protocol is
 * not the same, so this does not reuse OpenAiRealtimeSttClient:
 * - session.update takes flat fields (sample_rate, language, ...);
 * - 16 kHz PCM is accepted as-is, sent as binary frames (no base64, no
 *   upsampling);
 * - events carry no item_id, and input_audio_buffer.committed arrives AFTER
 *   the matching .completed. The server answers commits strictly in order, so
 *   commits are tracked as a FIFO instead of by id.
 *
 * Push-to-talk (or Faceclaw's own endpointing) owns the utterance boundary:
 * the server does not split an utterance on its own pauses.
 */

export type EvenSttOptions = CloudSttOptions & {
  /** ws:// or wss:// URL of the realtime endpoint. */
  url: string;
  /** "auto" (default) or a language code such as "es-ES". */
  language?: string;
};

/** Validates the configured endpoint; returns null when it is not a WebSocket URL. */
export function evenSttUrl(value: string): string | null {
  const url = value.trim();
  return /^wss?:\/\/[^\s/]+(\/\S*)?$/i.test(url) ? url : null;
}

export class EvenSttClient implements CloudSttClient {
  private ws: SocketConnection | null = null;
  private open = false;
  private closed = false;
  // PCM (or the commit sentinel) queued until the session is configured.
  private readonly pending: (Uint8Array | "commit")[] = [];
  /** Text of committed segments still waiting for their final, oldest first. */
  private readonly awaiting: { text: string; paragraphBreakAfter: boolean }[] = [];
  /** Deltas of the segment currently being spoken (after the last commit). */
  private partial = "";
  private committed = false;

  constructor(private readonly options: EvenSttOptions) {}

  start(): void {
    if (this.closed || this.ws) return;
    const listener = {
      onOpen: () => {
        if (this.closed) return;
        this.open = true;
        this.trySend(JSON.stringify(sessionConfig(this.options.language)));
        for (const item of this.pending.splice(0)) this.send(item);
        if (!this.closed) this.options.onReady?.();
      },
      onTextMessage: (message: string) => {
        if (!this.closed) this.handleMessage(String(message));
      },
      onClosed: () => {
        this.open = false;
        if (!this.closed) this.options.onDisconnected?.("EVO-X2 connection closed.");
      },
      onFailure: (message: string) => {
        if (this.closed) return;
        this.options.onDisconnected?.(`EVO-X2 connection failed: ${String(message)}`);
      },
    };
    try {
      this.ws = openSocket(this.options.url, listener, { name: "Authorization", value: `Bearer ${this.options.apiKey}` });
      this.options.onStatus("Connecting to EVO-X2...");
    } catch (error) {
      this.options.onDisconnected?.(`EVO-X2 connection failed: ${String((error as Error)?.message ?? error)}`);
    }
  }

  /** Feed PCM (16 kHz signed-16-bit LE), forwarded unchanged. */
  acceptPcm(pcm: Uint8Array): void {
    if (this.closed || pcm.length === 0) return;
    if (this.open) {
      this.send(pcm);
    } else {
      this.pending.push(pcm.slice());
    }
  }

  commitSegment(): void {
    this.commit(true);
  }

  /** End of utterance: commit the buffer for a final transcript. */
  finish(): void {
    this.committed = true;
    this.commit(false);
  }

  stop(): void {
    this.closed = true;
    this.open = false;
    if (this.ws) {
      try {
        this.ws.close(1000, "bye");
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.pending.length = 0;
  }

  private commit(paragraphBreakAfter: boolean): void {
    if (this.closed) return;
    // Later deltas belong to the next segment; this one waits for its final.
    this.awaiting.push({ text: this.partial, paragraphBreakAfter });
    this.partial = "";
    if (this.open) {
      this.send("commit");
    } else {
      this.pending.push("commit");
    }
  }

  private send(item: Uint8Array | "commit"): void {
    if (item === "commit") {
      this.trySend(JSON.stringify({ type: "input_audio_buffer.commit" }));
      return;
    }
    try {
      if (this.ws?.sendBinary(item) === false) this.options.onDisconnected?.("EVO-X2 send failed.");
    } catch (error) {
      this.options.onDisconnected?.(`EVO-X2 send failed: ${String(error)}`);
    }
  }

  private trySend(message: string): void {
    try {
      if (this.ws?.sendText(message) === false) {
        this.options.onDisconnected?.("EVO-X2 send failed.");
      }
    } catch (error) {
      this.options.onDisconnected?.(`EVO-X2 send failed: ${String(error)}`);
    }
  }

  private handleMessage(text: string): void {
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    switch (message?.type) {
      case "session.created":
        return;
      case "session.updated":
        this.options.onStatus("Listening (EVO-X2)...");
        return;
      case "conversation.item.input_audio_transcription.delta": {
        const delta = String(message.delta ?? "");
        if (!delta) return;
        this.partial += delta;
        this.emitPartial();
        return;
      }
      case "conversation.item.input_audio_transcription.completed": {
        // Finals answer commits in order. One without a pending commit would
        // be the server's own endpointing: it closes the current segment.
        const pendingCommit = this.awaiting.shift();
        const segment = pendingCommit ?? { text: this.partial, paragraphBreakAfter: false };
        if (!pendingCommit) this.partial = "";
        const transcript = message.transcript === undefined ? segment.text : String(message.transcript);
        this.options.onTranscript({ text: transcript.trim(), isFinal: true, paragraphBreakAfter: segment.paragraphBreakAfter });
        if (this.committed && !this.awaiting.length) {
          this.stop();
          return;
        }
        this.emitPartial();
        return;
      }
      case "input_audio_buffer.committed":
      case "input_audio_buffer.cleared":
        return;
      case "error": {
        const detail = String(message.error?.message ?? message.message ?? "unknown error");
        this.options.onError(`EVO-X2: ${detail}`);
        return;
      }
      default:
        return;
    }
  }

  /** Replace-semantics partial: committed-but-unfinished segments, then the live one. */
  private emitPartial(): void {
    const parts = [...this.awaiting, { text: this.partial, paragraphBreakAfter: false }];
    const text = parts.map((part) => part.text.trim()).filter(Boolean).join(" ");
    if (!text) return;
    const transcribeText = parts
      .filter((part) => part.text.trim())
      .map((part, index, kept) => (index && kept[index - 1]!.paragraphBreakAfter ? "\n" : index ? " " : "") + part.text.trim())
      .join("");
    this.options.onTranscript({ text, transcribeText, isFinal: false });
  }
}

function sessionConfig(language = "auto"): object {
  return {
    type: "session.update",
    session: {
      sample_rate: 16000,
      language,
      automatic_punctuation: true,
      // Keep the server's inverse text normalization (numbers as digits).
      verbatim: false,
    },
  };
}
