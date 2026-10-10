/** Official GGUF artifacts checked 10-10-2026. Candidates only, never a quality ranking. */
export const GATEKEEPER_MODELS = [
  { id: "qwen3-0.6b-q8", label: "Qwen3 0,6B · Q8", template: "qwen3",
    repository: "Qwen/Qwen3-0.6B-GGUF", fileName: "Qwen3-0.6B-Q8_0.gguf",
    sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031", sizeBytes: 639446688 },
  { id: "lfm2.5-1.2b-q4", label: "LFM2.5 1,2B · Q4_K_M", template: "lfm2",
    repository: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF", fileName: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
    sha256: "b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5", sizeBytes: 730895168 },
  { id: "qwen2.5-1.5b-q4", label: "Qwen2.5 1,5B · Q4_K_M", template: "chatml",
    repository: "Qwen/Qwen2.5-1.5B-Instruct-GGUF", fileName: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e", sizeBytes: 1117320736 },
  { id: "qwen3-1.7b-q8", label: "Qwen3 1,7B · Q8", template: "qwen3",
    repository: "Qwen/Qwen3-1.7B-GGUF", fileName: "Qwen3-1.7B-Q8_0.gguf",
    sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a", sizeBytes: 1834426016 },
] as const;
export type GatekeeperModelId = typeof GATEKEEPER_MODELS[number]["id"];
export function gatekeeperModel(id: string) { return GATEKEEPER_MODELS.find(m => m.id === id) ?? GATEKEEPER_MODELS[0]; }
