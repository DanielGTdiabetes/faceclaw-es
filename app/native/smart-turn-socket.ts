import { smartTurnUrl, type SmartTurnListener, type SmartTurnTransport } from "../conversation-detection/smart-turn";
declare const com: any;

/** Original Java PCM goes straight to OkHttp, with no JS conversion or audio retention. */
export function smartTurnSocket(endpoint: { url: string; key: string } | null,
  listener: SmartTurnListener): SmartTurnTransport | null {
  const url = endpoint && smartTurnUrl(endpoint.url);
  if (!url || !endpoint?.key) return null;
  const proxy = new com.faceclaw.app.FaceclawWebSocketListener({
    onOpen: () => listener.onOpen(),
    onTextMessage: (text: string) => listener.onTextMessage(String(text)),
    onClosed: () => listener.onClosed(),
    onFailure: () => listener.onFailure(),
  });
  const socket = new com.faceclaw.app.FaceclawWebSocket(url, proxy, "Authorization", `Bearer ${endpoint.key}`);
  return { listenerProxy: proxy,
    sendText: (text: string) => Boolean(socket.sendText(text)),
    sendBinary: (pcm: unknown) => Boolean(socket.sendBinary(pcm)),
    queuedBytes: () => Number(JSON.parse(String(socket.transportDiagnostics())).queuedBytes) || 0,
    close: (code: number, reason: string) => socket.close(code, reason),
  } as SmartTurnTransport;
}
