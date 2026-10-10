import { RemoteControlsViewModel } from './remote-controls-view-model';
import { BleBandwidthMeter } from "./ble-bandwidth-meter";
import {
  Application,
  Dialogs,
  Frame,
  ImageSource,
  Screen,
  SwipeDirection,
  type GestureEventData,
  type TextField,
  type SwipeGestureEventData,
  type TouchGestureEventData,
  type View,
} from "@nativescript/core";
import { dashboardController, type MirrorTouchKind } from "../g2/dashboard-controller";
import {
  mirrorTouchSetting,
  onAnySettingChanged,
  showBleBandwidthSetting, sonioxApiKeySetting,
} from "../ui/dashboard-settings";
import { sampleBleTraffic } from "../native/ble-traffic";
import { isValidMacAddress, loadDeviceAddresses } from "../g2/device-addresses";
import { isAutoReconnectSuppressed, resumeAutoReconnect } from "../g2/reconnect-policy";
import { isPreviewOnlyMode } from "./onboarding-state";
import { formatErrorMessage } from "../util/format-error";
import { G2_LENS_HEIGHT, G2_LENS_WIDTH } from "../graphics/image";
import { type PhoneUiButton } from "../apps/evenhub/manager";
import { asrModelState, conversationTextModelStatus, onAsrModelStateChanged, startAsrModelDownload, cancelAsrModelDownload } from "../native/asr-model";
import { conversationModelOption } from "../native/conversation-model-options";
import { micModelState, onMicModelStateChanged } from "../apps/microphones/mic-models";
import { profileGuide } from "../conversation-detection/profile-guide";
import { conversationDetail, conversationStartPlan, hermesHistoryText, manualHermesStatus, textLanguageLabel, wearerLine } from "../conversation-detection/conversation-ui";
import { hermesPresentationDiagnostics } from "../ui/shell/conversation-hermes-ui";
import {
  conversationDiagnosticsSelected, conversationTextEngine, conversationTextLanguage, conversationTextSelected, onConversationTextSelected,
  setConversationDiagnosticsSelected, setConversationTextLanguage, setConversationTextSelected,
  wearerActions, wearerChoices,
  CONVERSATION_MODELS, conversationModel, conversationLocalModel, setConversationModel, conversationUsesHermes, setConversationUsesHermes,
  conversationDailyContextSelected, setConversationDailyContextSelected,
  conversationFiltersEnabled, selectConversationListeningMode,
  conversationLocalSpeakers, setConversationLocalSpeakers, conversationSingleVoiceFilter, setConversationSingleVoiceFilter,
} from "../conversation-detection/session-controls";
import { type DiagnosticPhase } from "../conversation-detection/phase-diagnostics";
import { assistantBridge } from "../assistant/bridge-client";

const LENS_ASPECT_RATIO = G2_LENS_WIDTH / G2_LENS_HEIGHT;

type LayoutOrientation = "portrait" | "landscape";

export class MainViewModel extends RemoteControlsViewModel {
  private _conversationPanelOpen = false;
  private _conversationSettingsOpen = false;
  private _status = "Disconnected.";
  private _displayPreview: ImageSource | null = null;
  private _displayPreviewMessage = "";
  private _layoutOrientation: LayoutOrientation = this.readLayoutOrientation();
  private _landscapePreviewWidth = 0;
  private _landscapePreviewHeight = 0;
  private _controlsContentHeight = 250;
  private _activeTextSettingId: string | null = null;
  private _activeTextEditorTitle = "";
  private _activeTextSettingTitle = "";
  private _activeTextSettingValue = "";
  private _activeTextSettingInputKind: "text" | "email" | "password" = "text";
  private _secondaryTextSettingId: string | null = null;
  private _secondaryTextSettingTitle = "";
  private _secondaryTextSettingValue = "";
  private _secondaryTextSettingInputKind: "text" | "email" | "password" = "text";
  private _activeTextEditorToggleLabel = "";
  private _activeTextEditorToggleValue = false;
  private _activeTextEditorToggleVisible = false;
  private _keyboardInputActive = false;
  private _keyboardInputTargets: ReadonlyArray<{ id: string; label: string }> = [];
  private _keyboardInputText = "";
  private _evenAppConflictMessage = "";
  private _evenAppConflictWarningVisible = false;
  private _firmwareWarningMessage = "";
  private _firmwareWarningVisible = false;
  private _screenRecordingActive = false;
  private _batteryOptimizationWarningVisible = false;
  private _fontsMissingWarningVisible = false;
  private _alarmReliabilityMessage = "";
  private _warningsModalVisible = false;
  private _previewMode = false;
  private _evenHubPhoneUi: PhoneUiButton | null = null;
  private _phase: "disconnected" | "connecting" | "connected" | "charging" | "disconnecting" = "disconnected";
  private get conversationWithText(): boolean { return conversationTextSelected(); }
  private set conversationWithText(value: boolean) { setConversationTextSelected(value); }
  private localCloseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Brief refusal notice for «Hermes en conversación»; cleared by the next tap or bridge change. */
  private hermesNotice = "";
  private hermesShown = { button: "", status: "", history: "", summary: "", gatekeeper: "" };

  // A new view model is built on every navigation to the main page; these
  // module-level subscriptions must die with it (see dispose) or each
  // round-trip to another page leaks a listener that pins the dead model.
  private readonly unsubscribers: Array<() => void> = [];

  constructor() {
    super();
    this.attach();
  }

  /**
   * Subscribe to the controller and settings. Idempotent; the page calls it
   * again from `loaded` because an app suspend fires unloaded/loaded (which
   * dispose the model) without a navigation building a fresh one. Subscribing
   * delivers the current snapshot, so a re-attached model catches up.
   */
  attach(): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(dashboardController.subscribe((snapshot) => {
      this.status = snapshot.status;
      this.previewMode = snapshot.previewMode;
      this.displayPreview = snapshot.displayPreview;
      this.displayPreviewMessage = snapshot.displayPreviewMessage;
      this.phase = snapshot.phase;
      this.activeTextSettingId = snapshot.activeTextSettingId;
      this.activeTextEditorTitle = snapshot.activeTextEditorTitle;
      this.activeTextSettingTitle = snapshot.activeTextSettingTitle;
      this.activeTextSettingValue = snapshot.activeTextSettingValue;
      this.activeTextSettingInputKind = snapshot.activeTextSettingInputKind;
      this.secondaryTextSettingId = snapshot.secondaryTextSettingId;
      this.secondaryTextSettingTitle = snapshot.secondaryTextSettingTitle;
      this.secondaryTextSettingValue = snapshot.secondaryTextSettingValue;
      this.secondaryTextSettingInputKind = snapshot.secondaryTextSettingInputKind;
      this.activeTextEditorToggleLabel = snapshot.activeTextEditorToggleLabel;
      this.activeTextEditorToggleValue = snapshot.activeTextEditorToggleValue;
      this.activeTextEditorToggleVisible = snapshot.activeTextEditorToggleVisible;
      // Targets before active: the panel's buttons are labelled when it appears.
      this.keyboardInputTargets = snapshot.keyboardInputTargets;
      this.keyboardInputActive = snapshot.keyboardInputActive;
      this.evenAppConflictMessage = snapshot.evenAppConflictMessage;
      this.evenAppConflictWarningVisible = snapshot.evenAppConflictWarningVisible;
      this.firmwareWarningMessage = snapshot.firmwareWarningMessage;
      this.firmwareWarningVisible = snapshot.firmwareWarningVisible;
      this.screenRecordingActive = snapshot.screenRecordingActive;
      this.batteryOptimizationWarningVisible = snapshot.batteryOptimizationWarningVisible;
      this.fontsMissingWarningVisible = snapshot.fontsMissingWarningVisible;
      this.alarmReliabilityMessage = snapshot.alarmReliabilityMessage;
      this.evenHubPhoneUi = snapshot.evenHubPhoneUi;
      this.refreshPadFocusLine();
    }));
    // Brightness / display mode can change from the glasses' Settings app too.
    this.unsubscribers.push(onAnySettingChanged(() => {
      this.refreshDisplayControls();
      this.syncBleBandwidthPolling();
    }));
    this.syncBleBandwidthPolling();
    this.unsubscribers.push(() => this.stopBleBandwidthPolling());
    this.unsubscribers.push(dashboardController.conversationDetector.subscribe(() => {
      this.refreshConversationUi();
      this.refreshHermesUi();
    }));
    // Hermes selection/runtime and bridge capability: labels only, never audio or channel calls.
    this.unsubscribers.push(dashboardController.onConversationHermesChange(() => this.refreshHermesUi()));
    this.unsubscribers.push(assistantBridge.onStateChange(() => {
      this.hermesNotice = ""; this.refreshHermesUi();
      this.notifyPropertyChange("conversationMemoryButton", this.conversationMemoryButton);
      this.notifyPropertyChange("conversationMemoryStatus", this.conversationMemoryStatus);
    }));
    this.hermesShown = { button: "", status: "", history: "", summary: "", gatekeeper: "" };
    this.refreshHermesUi();
    this.unsubscribers.push(onConversationTextSelected(() => this.refreshConversationUi()));
    this.unsubscribers.push(() => {
      if (this.localCloseTimer !== null) clearTimeout(this.localCloseTimer);
      this.localCloseTimer = null;
    });
    for (const id of ["whisper-base-es", "whisper-small-es", "whisper-medium-es"] as const) {
      this.unsubscribers.push(onAsrModelStateChanged(id, () => {
        this.notifyPropertyChange("localTranscriptionButton", this.localTranscriptionButton);
        this.refreshConversationUi();
      }));
    }
    this.unsubscribers.push(onMicModelStateChanged((id) => {
      if (id !== "speaker-embedding") return;
      this.refreshConversationUi();
    }));
  }

  private refreshConversationUi(pollsLeft = 60): void {
    if (this.localCloseTimer !== null) clearTimeout(this.localCloseTimer);
    this.localCloseTimer = null;
    this.notifyPropertyChange("conversationDetectorLabel", this.conversationDetectorLabel);
    this.notifyPropertyChange("conversationDetectorDetail", this.conversationDetectorDetail);
    this.notifyPropertyChange("conversationDetectorButton", this.conversationDetectorButton);
    this.notifyPropertyChange("conversationTextButton", this.conversationTextButton);
    this.notifyPropertyChange("conversationLanguageButton", this.conversationLanguageButton);
    this.notifyPropertyChange("conversationDiagnosticsButton", this.conversationDiagnosticsButton);
    this.notifyPropertyChange("conversationPhaseLabel", this.conversationPhaseLabel);
    this.notifyPropertyChange("conversationPhaseVisibility", this.conversationPhaseVisibility);
    this.notifyPropertyChange("conversationWearerLabel", this.conversationWearerLabel);
    this.notifyPropertyChange("conversationWearerVisibility", this.conversationWearerVisibility);
    this.notifyPropertyChange("conversationWearerPhraseButton", this.conversationWearerPhraseButton);
    this.notifyPropertyChange("localTranscript", this.localTranscript);
    this.notifyPropertyChange("conversationEngineButton", this.conversationEngineButton);
    this.notifyPropertyChange("conversationModeButton", this.conversationModeButton);
    this.notifyPropertyChange("conversationMemoryButton", this.conversationMemoryButton);
    this.notifyPropertyChange("conversationMemoryStatus", this.conversationMemoryStatus);
    this.notifyPropertyChange("conversationGatekeeperStatus", this.conversationGatekeeperStatus);
    for (const name of ["conversationStartVisibility", "conversationStopVisibility", "conversationModeSummary", "conversationEntryLabel",
      "conversationGatekeeperStartLabel", "conversationSettingsHint", "conversationSpeakersButton", "conversationSpeakersStatus",
      "conversationStartNotice", "conversationStartNoticeVisibility"]) {
      this.notifyPropertyChange(name, this[name as keyof MainViewModel]);
    }
    this.notifyPropertyChange("conversationDownloadButton", this.conversationDownloadButton);
    this.notifyPropertyChange("conversationDownloadVisibility", this.conversationDownloadVisibility);
    this.notifyPropertyChange("conversationModelStatus", this.conversationModelStatus);
    this.notifyPropertyChange("conversationTranscriptVisibility", this.conversationTranscriptVisibility);
    this.notifyPropertyChange("conversationHermesButton", this.conversationHermesButton);
    this.notifyPropertyChange("localTranscriptionLabel", this.localTranscriptionLabel);
    this.notifyPropertyChange("localTranscriptionButton", this.localTranscriptionButton);
    this.notifyPropertyChange("localTranscriptionCanStart", this.localTranscriptionCanStart);
    this.notifyPropertyChange("voiceProfileSetupLabel", this.voiceProfileSetupLabel);
    this.notifyPropertyChange("voiceProfileButton", this.voiceProfileButton);
    // UI-only polling after OFF until native ASR drains: no audio, no auto-start, cancelled on unload.
    // A slow JNI decode can outlast 30 s, so polling slows down instead of leaving the controls frozen.
    if (this.conversationClosing) {
      this.localCloseTimer = setTimeout(() => this.refreshConversationUi(Math.max(0, pollsLeft - 1)), pollsLeft > 0 ? 500 : 2000);
    }
  }

  /** Capture is OFF but a native worker still drains: starting now would be refused. */
  get conversationClosing(): boolean {
    const snapshot = dashboardController.conversationDetector.snapshot();
    return !snapshot.enabled && !!(snapshot.participation?.worker || snapshot.participation?.busy
      || snapshot.transcription?.worker || snapshot.transcription?.busy);
  }

  /**
   * Shown in the start card while OFF: a refused start, the closing state or why the last session ended.
   * The ON-only status card is hidden in OFF, so this is where refusals stay visible.
   */
  get conversationStartNotice(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    if (snapshot.enabled) return "";
    if (this.conversationClosing) return "Terminando reconocimiento… Los botones se activan solos al terminar.";
    if (this.hermesNotice) return this.hermesNotice;
    if (snapshot.state === "error" || snapshot.stopReason === "expired") return snapshot.reason;
    return "";
  }
  get conversationStartNoticeVisibility(): string { return this.conversationStartNotice ? "visible" : "collapse"; }

  /** Notifies only on a changed label: runtime ticks (500 ms) never flood the binding. */
  private refreshHermesUi(): void {
    const button = this.conversationHermesButton, status = this.conversationHermesStatus, history = this.conversationHermesHistory;
    if (button !== this.hermesShown.button) this.notifyPropertyChange("conversationHermesButton", button);
    if (status !== this.hermesShown.status) {
      this.notifyPropertyChange("conversationHermesStatus", status);
      this.notifyPropertyChange("conversationStartNotice", this.conversationStartNotice);
      this.notifyPropertyChange("conversationStartNoticeVisibility", this.conversationStartNoticeVisibility);
    }
    if (history !== this.hermesShown.history) {
      this.notifyPropertyChange("conversationHermesHistory", history);
      this.notifyPropertyChange("conversationHermesHistoryVisibility", this.conversationHermesHistoryVisibility);
    }
    const summary = this.conversationModeSummary, gatekeeper = this.conversationGatekeeperStatus;
    if (summary !== this.hermesShown.summary) this.notifyPropertyChange("conversationModeSummary", summary);
    if (gatekeeper !== this.hermesShown.gatekeeper) this.notifyPropertyChange("conversationGatekeeperStatus", gatekeeper);
    this.hermesShown = { button, status, history, summary, gatekeeper };
  }

  get conversationHermesButton(): string {
    return `${conversationUsesHermes() ? "Hermes en conversación" : "Solo texto"}: ${dashboardController.conversationDetector.snapshot().enabled ? "ON · detener" : "OFF · iniciar"}`;
  }

  get conversationHermesStatus(): string {
    if (!conversationUsesHermes()) {
      const snapshot = dashboardController.conversationDetector.snapshot();
      return this.hermesNotice || (snapshot.enabled ? `Solo transcripción · ${snapshot.reason}` : "Solo texto, sin consultas a Hermes. Sin límite de tiempo; OFF borra el texto.");
    }
    const runtime = dashboardController.conversationHermes.snapshot();
    if (this.hermesNotice) return this.hermesNotice;
    const conversation = assistantBridge.conversation;
    return manualHermesStatus(dashboardController.conversationDetector.snapshot(), runtime, {
      supported: conversation.isSupported(), optionalIdentity: conversation.supportsOptionalIdentity?.() ?? false });
  }

  /** Last Hermes messages of this session (RAM only), visible while ON. */
  get conversationHermesHistory(): string {
    return hermesHistoryText(dashboardController.conversationDetector.snapshot().enabled,
      dashboardController.conversationHermes.history());
  }

  get conversationHermesHistoryVisibility(): string { return this.conversationHermesHistory ? "visible" : "collapsed"; }

  /** The same explicit session ON/OFF as the glasses system menu. */
  onConversationHermesTap(): void {
    this.hermesNotice = dashboardController.toggleManualConversation();
    this.refreshHermesUi();
  }

  get conversationPanelVisibility(): string { return this._conversationPanelOpen ? "visible" : "collapse"; }
  get remotePanelVisibility(): string { return this._conversationPanelOpen ? "collapse" : "visible"; }
  get conversationSettingsVisibility(): string { return this._conversationSettingsOpen ? "visible" : "collapse"; }
  get conversationSettingsButton(): string { return this._conversationSettingsOpen ? "Cerrar ajustes" : "Ajustes de conversación"; }
  private get conversationOn(): boolean { return dashboardController.conversationDetector.snapshot().enabled; }
  get conversationEntryLabel(): string { return this.conversationOn ? "Conversación · escuchando" : "Conversación"; }
  get conversationStartVisibility(): string { return this.conversationOn ? "collapse" : "visible"; }
  get conversationStopVisibility(): string { return this.conversationOn ? "visible" : "collapse"; }
  get conversationModeSummary(): string {
    if (this.conversationClosing) return "Escucha apagada · terminando reconocimiento";
    if (!this.conversationOn) return "Escucha apagada";
    return !conversationUsesHermes() ? "Escucha activa · solo transcripción"
      : conversationFiltersEnabled() ? "Escucha activa · filtros locales + Hermes" : "Escucha activa · Hermes";
  }
  get conversationSettingsHint(): string {
    return this.localTranscriptionCanStart ? "Elige cómo reconocer la voz y qué recordar."
      : this.conversationClosing ? "Terminando reconocimiento; los ajustes se activan al terminar."
      : "Detén la escucha para cambiar los ajustes.";
  }
  onConversationPanelTap(): void { this.setConversationPanel(true); }
  onRemotePanelTap(): void { this.setConversationPanel(false); }
  closeConversationPanel(): boolean {
    if (!this._conversationPanelOpen) return false;
    this.setConversationPanel(false); return true;
  }
  private setConversationPanel(open: boolean): void {
    this._conversationPanelOpen = open;
    this.notifyPropertyChange("conversationPanelVisibility", this.conversationPanelVisibility);
    this.notifyPropertyChange("remotePanelVisibility", this.remotePanelVisibility);
  }
  onConversationSettingsTap(): void {
    this._conversationSettingsOpen = !this._conversationSettingsOpen;
    this.notifyPropertyChange("conversationSettingsVisibility", this.conversationSettingsVisibility);
    this.notifyPropertyChange("conversationSettingsButton", this.conversationSettingsButton);
  }
  get conversationGatekeeperStartLabel(): string { return "Escucha continua con filtros locales"; }
  onConversationGatekeeperStartTap(): void { this.startConversation("gatekeeper"); }
  onConversationDirectStartTap(): void { this.startConversation("hermes"); }
  onConversationTextStartTap(): void { this.startConversation("text"); }
  /** The mode applies atomically to the next session; a refusal stays visible in the start card. */
  private startConversation(mode: "gatekeeper" | "hermes" | "text"): void {
    if (this.conversationOn) return;
    if (this.conversationClosing) { this.refreshConversationUi(); return; }
    if (!selectConversationListeningMode(mode)) return;
    this.hermesNotice = dashboardController.setManualConversationEnabled(true);
    this.refreshConversationUi(); this.refreshHermesUi();
  }
  onConversationStopTap(): void {
    if (!this.conversationOn) return;
    this.hermesNotice = dashboardController.setManualConversationEnabled(false);
    this.refreshConversationUi(); this.refreshHermesUi();
  }

  get conversationDetectorLabel(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    return `Conversación local · ${snapshot.enabled ? snapshot.state : snapshot.state === "error" ? "OFF · error" : "OFF"}`;
  }

  get conversationDetectorDetail(): string {
    return conversationDetail(dashboardController.conversationDetector.snapshot(), this.conversationPlan.hint);
  }

  private get conversationPlan() {
    const detector = dashboardController.conversationDetector;
    return conversationStartPlan(detector.snapshot(), detector.ownProfileState(),
      micModelState("speaker-embedding").status, this.conversationTextReady, this.conversationWithText,
      conversationTextLanguage());
  }

  /** RAM selector, OFF only; the running session keeps the language it started with. */
  get conversationLanguageButton(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    const language = snapshot.enabled ? snapshot.languageMode : conversationTextLanguage();
    const label = language === "es" ? "Solo español" : language === "auto" ? "Automático" : "Sin texto";
    return `Idioma: ${label}`;
  }

  onConversationLanguageTap(): void {
    if (!this.localTranscriptionCanStart) return;
    setConversationTextLanguage(conversationTextLanguage() === "es" ? "auto" : "es");
  }

  get conversationDiagnosticsButton(): string {
    return `Diagnóstico por fases: ${conversationDiagnosticsSelected() ? "ON" : "OFF"} · ${this.localTranscriptionCanStart ? "tocar para cambiar" : "sesión en curso"}`;
  }

  onConversationDiagnosticsTap(): void {
    if (!this.localTranscriptionCanStart) return;
    setConversationDiagnosticsSelected(!conversationDiagnosticsSelected());
  }

  /** Phase marks exist only during a session started with diagnostics; they are the user's marks. */
  get conversationPhaseVisibility(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    return snapshot.enabled && snapshot.phases ? "visible" : "collapsed";
  }

  get conversationPhaseLabel(): string {
    const phases = dashboardController.conversationDetector.snapshot().phases;
    const names: Record<DiagnosticPhase, string> = { "sin-marcar": "sin marcar", "otra-persona": "otra persona",
      yo: "yo", referencia: "referencia (nadie habla)", fin: "fin" };
    return phases ? `Fase marcada por ti: ${names[phases.current]} · ${phases.marks} marcas` : "";
  }

  private markPhase(phase: DiagnosticPhase): void {
    dashboardController.conversationDetector.markPhase(phase);
    this.notifyPropertyChange("conversationPhaseLabel", this.conversationPhaseLabel);
  }
  onPhaseOtherTap(): void { this.markPhase("otra-persona"); }
  onPhaseMeTap(): void { this.markPhase("yo"); }
  onPhaseReferenceTap(): void { this.markPhase("referencia"); }
  onPhaseEndTap(): void { this.markPhase("fin"); }

  get conversationDetectorButton(): string {
    return this.conversationPlan.button;
  }

  get conversationTextButton(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    const selected = snapshot.enabled ? snapshot.transcription?.enabled : this.conversationWithText;
    return `Texto local opcional: ${selected ? "ON" : "OFF"} · ${snapshot.enabled ? "sesión en curso" : "tocar para cambiar"}`;
  }

  onConversationTextTap(): void {
    if (!this.localTranscriptionCanStart) return;
    this.conversationWithText = !this.conversationWithText;
    this.notifyPropertyChange("conversationTextButton", this.conversationTextButton);
    this.notifyPropertyChange("conversationDetectorButton", this.conversationDetectorButton);
    this.notifyPropertyChange("conversationDetectorDetail", this.conversationDetectorDetail);
  }

  get voiceProfileButton(): string {
    return dashboardController.conversationDetector.ownProfileState() === "guardado" ? "Mi perfil · guardado" : "Mi perfil · consultar / crear";
  }

  get voiceProfileSetupLabel(): string {
    const detector = dashboardController.conversationDetector;
    return profileGuide(detector.snapshot(), detector.ownProfileState(), micModelState("speaker-embedding").status).state;
  }

  onVoiceProfileTap(): void {
    if (!this.localTranscriptionCanStart) return;
    Frame.topmost()?.navigate("phone-ui/voice-profile-page");
  }

  onConversationDetectorTap(): void {
    const detector = dashboardController.conversationDetector;
    if (detector.snapshot().enabled) { dashboardController.setConversationCaptureEnabled(false); return; }
    this.refreshConversationUi();
    const plan = this.conversationPlan;
    if (!plan.canStart) {
      void Dialogs.alert({ title: "Conversación local · OFF", message: plan.hint, okButtonText: "Cerrar" });
      return;
    }
    dashboardController.setConversationCaptureEnabled(true, plan.transcribe, plan.mode);
  }

  /** S2: wearer association line; empty when OFF or before Soniox opens. */
  get conversationWearerLabel(): string {
    return wearerLine(dashboardController.conversationDetector.snapshot());
  }

  get conversationWearerVisibility(): "visible" | "collapse" {
    return wearerActions(dashboardController.conversationDetector).length ? "visible" : "collapse";
  }

  /** Primary phrase action on the page itself, visible without opening the manual voice list. */
  get conversationWearerPhraseButton(): string {
    return wearerActions(dashboardController.conversationDetector)[0]?.label ?? "Identificar mi voz (frase)";
  }

  onConversationWearerPhraseTap(): void {
    wearerActions(dashboardController.conversationDetector)[0]?.run();
    this.refreshConversationUi();
  }

  /** Identify, finish, cancel or correct the wearer. Actions captured now; stale ones are rejected. */
  async onConversationWearerTap(): Promise<void> {
    const detector = dashboardController.conversationDetector;
    const actions = [...wearerActions(detector), ...wearerChoices(detector)];
    if (!actions.length) return;
    const choice = await Dialogs.action({ title: "Mi voz en esta sesión", cancelButtonText: "Cerrar",
      message: "Identifica tu voz con la frase o elige la etiqueta. Elegir cancela un intento pendiente.",
      actions: actions.map((action) => action.label) });
    actions.find((action) => action.label === choice)?.run();
    this.refreshConversationUi();
  }

  onConversationDetectorMetricsTap(): void {
    const detector = dashboardController.conversationDetector;
    if (detector.snapshot().enabled) return; // Aggregate inspection after OFF, not during capture.
    const snapshot = detector.snapshot();
    const draining = snapshot.transcription?.worker || snapshot.transcription?.busy
      || snapshot.participation?.worker || snapshot.participation?.busy;
    const note = draining ? "Drenando motores locales: cifras todavía no finales. Vuelve a abrir en unos segundos.\n" : "";
    const summary = detector.lastSessionSummary();
    void Dialogs.alert({ title: "Métricas locales", message: note + JSON.stringify(snapshot, null, 2)
      + (summary ? "\nÚltima sesión Soniox (sin texto): " + JSON.stringify(summary, null, 2) : "")
      + "\nHermes (métricas, sin texto): " + JSON.stringify(dashboardController.conversationHermes?.diagnostics?.() ?? null)
      + "\nLentes Hermes (recuentos, sin texto): " + JSON.stringify({ ...hermesPresentationDiagnostics(),
        shellRenderFailures: dashboardController.shellRenderDiagnostics() })
      + "\nNativo: " + detector.diagnostics(), okButtonText: "Cerrar" });
  }

  /** Soniox needs only its key; the local engine needs downloaded Whisper weights. */
  private get conversationTextReady(): string {
    return conversationTextEngine() === "soniox" ? (sonioxApiKeySetting.get().trim() ? "ready" : "absent")
      : conversationTextModelStatus(conversationLocalModel());
  }

  get conversationEngineButton(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    const active = snapshot.enabled && snapshot.state === "escuchando" && snapshot.transcription?.model ? " · en uso" : "";
    const model = conversationModel();
    const name = model === "soniox" ? "Soniox (nube)" : `Whisper ${model.split("-")[1]} (local)`;
    return `Motor: ${name}${active}`;
  }
  get conversationModeButton(): string { return `Modo: ${conversationUsesHermes() ? "Texto y Hermes" : "Solo texto"}`; }
  get conversationMemoryButton(): string {
    return "Memoria del día: " + (conversationDailyContextSelected() ? "24 h" : "desactivada");
  }
  get conversationMemoryStatus(): string {
    if (!assistantBridge.conversation.supportsDailyContext()) return "Memoria de 24 h no disponible en el servidor conectado.";
    if (!conversationDailyContextSelected()) return "No se consulta ni añade memoria. Los resúmenes anteriores caducan; puedes borrarlos desde este menú.";
    return conversationUsesHermes()
      ? "Resúmenes en tu servidor durante 24 h. Se borran automáticamente; consultarlos no renueva el plazo."
      : "La memoria del día requiere Texto y Hermes. Solo texto no guarda resúmenes.";
  }
  get conversationSpeakersButton(): string {
    return "Voces: " + (conversationLocalSpeakers() ? "distinguir con Whisper" : "sin distinguir")
      + (conversationSingleVoiceFilter() ? " · ignorar voz única" : "");
  }
  get conversationSpeakersStatus(): string {
    const speakers = conversationLocalSpeakers()
      ? "Con Whisper local, cada frase se corta en las pausas y se asocia a tu voz (si tienes perfil) o a otra voz de la sesión. Necesita el modelo de voz descargado."
      : "Whisper local entrega el texto sin saber quién habla.";
    return conversationSingleVoiceFilter()
      ? `${speakers} No se consulta a Hermes mientras solo se oye una misma voz ajena (televisión, radio).`
      : speakers;
  }
  async onConversationSpeakersTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    const actions = [
      conversationLocalSpeakers() ? "No distinguir voces" : "Distinguir voces con Whisper",
      conversationSingleVoiceFilter() ? "Consultar aunque solo hable una voz ajena" : "Ignorar una sola voz ajena (TV, radio)",
    ];
    const choice = await Dialogs.action({ title: "Voces en la conversación", cancelButtonText: "Cerrar", actions });
    if (!this.localTranscriptionCanStart) return;
    if (choice === actions[0]) setConversationLocalSpeakers(!conversationLocalSpeakers());
    else if (choice === actions[1]) setConversationSingleVoiceFilter(!conversationSingleVoiceFilter());
    this.refreshConversationUi();
  }
  async onConversationMemoryTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    const actions = ["Usar resúmenes durante 24 h", "No usar memoria del día", "Borrar memoria del día"];
    const choice = await Dialogs.action({ title: "Continuidad durante el día", cancelButtonText: "Cerrar", actions });
    if (!this.localTranscriptionCanStart) return;
    if (choice === actions[1]) {
      setConversationDailyContextSelected(false);
    } else if (choice === actions[0]) {
      if (!assistantBridge.conversation.supportsDailyContext()) {
        this.hermesNotice = "El servidor conectado todavía no ofrece memoria de 24 h.";
      } else {
        const accepted = await Dialogs.confirm({ title: "Memoria de 24 horas",
          message: "Hermes conservará resúmenes breves por tema en tu servidor para retomar conversaciones durante el día. Caducan 24 h después de actualizarse. No se guarda audio ni la transcripción completa.",
          okButtonText: "Activar 24 h", cancelButtonText: "Cancelar" });
        if (accepted && this.localTranscriptionCanStart && assistantBridge.conversation.supportsDailyContext()) {
          setConversationDailyContextSelected(true);
        }
      }
    } else if (choice === actions[2]) {
      const accepted = await Dialogs.confirm({ title: "Borrar memoria del día",
        message: "Se eliminarán todos los resúmenes temporales del servidor. No afecta al perfil de voz ni al historial del asistente.",
        okButtonText: "Borrar", cancelButtonText: "Cancelar" });
      if (accepted && this.localTranscriptionCanStart) {
        const sent = assistantBridge.conversation.forgetDailyContext((ok) => {
          this.hermesNotice = ok ? "Memoria del día borrada." : "No se pudo confirmar el borrado de la memoria del día.";
          this.refreshHermesUi();
        });
        if (!sent) this.hermesNotice = "Memoria del día no disponible o borrado en curso.";
      }
    }
    this.refreshConversationUi(); this.refreshHermesUi();
  }
  get conversationModelStatus(): string {
    const model = conversationModel();
    if (model === "soniox") return sonioxApiKeySetting.get().trim() ? "Reconoce y separa voces en la nube." : "Falta la clave de Soniox en Ajustes.";
    const state = asrModelState(model);
    if (state.error) return state.error;
    const ready = state.status === "ready" ? "Descargado. Puedes iniciar." : "Pulsa Descargar; al terminar, pulsa Iniciar.";
    return `${ready} Reconocimiento en el móvil, sin separar voces.${model === "whisper-medium-es" ? " Medium es experimental y puede tardar más." : ""}`;
  }
  get conversationDownloadVisibility(): string {
    const model = conversationModel();
    return model !== "soniox" && asrModelState(model).status !== "ready" ? "visible" : "collapse";
  }
  get conversationDownloadButton(): string {
    const model = conversationModel();
    if (model === "soniox") return "";
    const state = asrModelState(model);
    return state.status === "downloading" ? `Descargando ${Math.floor(state.bytesDownloaded * 100 / state.totalBytes)} % · pausar`
      : `Descargar ${Math.ceil(state.totalBytes / 1_000_000)} MB`;
  }
  onConversationDownloadTap(): void {
    if (!this.localTranscriptionCanStart) return;
    const model = conversationModel();
    if (model === "soniox") return;
    if (asrModelState(model).status === "downloading") cancelAsrModelDownload(model); else startAsrModelDownload(model);
    this.refreshConversationUi();
  }
  get conversationTranscriptVisibility(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    return snapshot.enabled && snapshot.state === "escuchando" ? "visible" : "collapse";
  }
  async onConversationModeTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    const options = ["Texto y Hermes", "Solo texto (sin consultar a Hermes)"];
    const choice = await Dialogs.action({ title: "Modo de conversación", cancelButtonText: "Cerrar", actions: options });
    if (!this.localTranscriptionCanStart || !options.includes(choice)) return;
    setConversationUsesHermes(choice === options[0]); this.hermesNotice = "";
    this.refreshConversationUi(); this.refreshHermesUi();
  }
  async onConversationEngineTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    const labels = CONVERSATION_MODELS.map(conversationModelOption);
    const choice = await Dialogs.action({ title: "Motor de conversación", cancelButtonText: "Cerrar",
      message: "Whisper funciona en el móvil. Hermes sigue usando el puente y su proveedor. Medium puede tardar más y consumir más memoria.", actions: labels });
    if (!this.localTranscriptionCanStart) return;
    const index = labels.indexOf(choice);
    if (index < 0) return;
    const model = CONVERSATION_MODELS[index]!;
    setConversationModel(model); this.hermesNotice = ""; this.refreshConversationUi(); this.refreshHermesUi();
  }

  /** A4: the phone label is line-limited, so show the newest tail instead of the oldest head. */
  get localTranscript(): string {
    const text = dashboardController.conversationDetector.transcriptText();
    if (text.length <= 320) return text;
    const tail = text.slice(-320);
    const space = tail.indexOf(" ");
    return "…" + (space >= 0 && space < 40 ? tail.slice(space + 1) : tail);
  }
  /** OFF and fully closed: settings and starts are enabled only once native ASR has drained. */
  get localTranscriptionCanStart(): boolean { return !this.conversationOn && !this.conversationClosing; }
  get localTranscriptionLabel(): string {
    const state = dashboardController.conversationDetector.snapshot().transcription;
    const language = dashboardController.conversationDetector.snapshot().languageMode;
    const engine = state?.engine === "soniox" ? "Soniox (nube)" : state?.model ?? state?.engine ?? "local";
    return state?.enabled ? `Texto provisional ${textLanguageLabel(language)} · ${engine} · ${state.status} · puede equivocarse con ruido. Se borra al parar.` : "";
  }
  get localTranscriptionButton(): string {
    if (conversationTextEngine() === "soniox") return "Solo transcripción con Soniox";
    const model = asrModelState(conversationLocalModel());
    if (model.status === "downloading") return `Modelo local: ${Math.floor(model.bytesDownloaded * 100 / model.totalBytes)} %`;
    return model.status === "ready" ? "Solo transcripción con el modelo seleccionado" : "Descargar el modelo seleccionado";
  }
  onLocalTranscriptionTap(): void {
    if (!this.localTranscriptionCanStart) return;
    const selected = conversationModel();
    if (selected !== "soniox" && asrModelState(selected).status !== "ready") {
      startAsrModelDownload(selected);
      return; // Weights only; download completion never starts capture.
    }
    setConversationUsesHermes(false);
    this.onConversationHermesTap();
  }

  async onConversationOptionsTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    const choice = await Dialogs.action({ title: "Diagnóstico de conversación", cancelButtonText: "Cerrar",
      actions: ["Métricas de la última sesión", "Filtros locales"] });
    if (!this.localTranscriptionCanStart) return;
    if (choice === "Métricas de la última sesión") { this.onConversationDetectorMetricsTap(); return; }
    if (choice === "Filtros locales") await this.onGatekeeperOptionsTap();
  }

  get conversationGatekeeperStatus(): string {
    const vad = dashboardController.conversationDetector.snapshot().transcription?.analysis?.vadStatus;
    if (vad === "unavailable") return "Aviso: WebRTC VAD no disponible. Whisper continúa sin ese filtro de voz; consulta las métricas.";
    if (this.localTranscriptionCanStart) return "Filtros locales preparados · sin modelo ni descarga.";
    if (!conversationUsesHermes() || !conversationFiltersEnabled()) return "Filtros de llamadas desactivados.";
    const report = dashboardController.conversationHermes.diagnostics().filters;
    return report.remaining === 0
      ? `Límite de 120 llamadas/h alcanzado. Hermes disponible en ${Math.max(1, Math.ceil(report.retryAfterMs / 60_000))} min; la transcripción continúa.`
      : "Filtros locales activos · fragmentos agrupados · máximo 120 llamadas/h.";
  }
  async onGatekeeperOptionsTap(): Promise<void> {
    if (!this.localTranscriptionCanStart) return;
    await Dialogs.alert({ title: "Filtros locales · última sesión",
      message: JSON.stringify(dashboardController.conversationHermes.diagnostics().filters, null, 2), okButtonText: "Cerrar" });
  }

  /** Detach from the controller and settings; the page calls this when it lets go of the model. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  get status(): string {
    return this._status;
  }

  set status(value: string) {
    if (this._status !== value) {
      this._status = value;
      this.notifyPropertyChange("status", value);
      this.notifyPropertyChange("connectionStatusLabel", this.connectionStatusLabel);
    }
  }

  /**
   * Short connection indicator for the action bar. The full status string
   * (which can be a sentence, e.g. a failure reason) stays available by
   * tapping the indicator.
   */
  get connectionStatusLabel(): string {
    switch (this._phase) {
      case "connected":
        return "Conectado";
      case "charging":
        return "Cargando";
      case "disconnecting":
        return "Desconectando";
      case "connecting":
        // The transport reports retry loops as "Reconnecting..." with the
        // phase still "connecting"; keep that distinction visible.
        return this._status.startsWith("Reconnecting") ? "Reconectando" : "Conectando";
      default:
        if (this._status.startsWith("Failed")) return "Error";
        // The headless preview display is live; "Disconnected" would suggest
        // the interactive mirror below it is broken.
        return this._previewMode ? "Vista previa" : "Desconectado";
    }
  }

  get previewMode(): boolean {
    return this._previewMode;
  }

  set previewMode(value: boolean) {
    if (this._previewMode !== value) {
      this._previewMode = value;
      this.notifyPropertyChange("previewMode", value);
      this.notifyPropertyChange("connectionStatusLabel", this.connectionStatusLabel);
    }
  }

  onConnectionStatusTap(): void {
    void Dialogs.alert({ title: "Estado de conexión", message: this._status, okButtonText: "OK" });
  }

  get displayPreview(): ImageSource | null {
    return this._displayPreview;
  }

  set displayPreview(value: ImageSource | null) {
    if (this._displayPreview !== value) {
      this._displayPreview = value;
      this.notifyPropertyChange("displayPreview", value);
      this.notifyPropertyChange("hasDisplayPreview", this.hasDisplayPreview);
      this.notifyPropertyChange("displayPreviewVisibility", this.displayPreviewVisibility);
    }
  }

  get displayPreviewMessage(): string {
    return this._displayPreviewMessage;
  }

  set displayPreviewMessage(value: string) {
    if (this._displayPreviewMessage !== value) {
      this._displayPreviewMessage = value;
      this.notifyPropertyChange("displayPreviewMessage", value);
      this.notifyPropertyChange("displayPreviewMessageVisibility", this.displayPreviewMessageVisibility);
      this.notifyPropertyChange("displayPreviewVisibility", this.displayPreviewVisibility);
    }
  }

  get hasDisplayPreview(): boolean {
    return this._displayPreview !== null;
  }

  /**
   * The preview and its stand-in message are mutually exclusive and occupy the
   * same box, so the form doesn't reflow when one replaces the other.
   */
  get displayPreviewVisibility(): "visible" | "collapse" {
    return this.hasDisplayPreview && !this._displayPreviewMessage ? "visible" : "collapse";
  }

  get displayPreviewMessageVisibility(): "visible" | "collapse" {
    return this._displayPreviewMessage ? "visible" : "collapse";
  }

  get displayPreviewHeight(): number {
    return Screen.mainScreen.widthDIPs / LENS_ASPECT_RATIO;
  }

  get landscapeDisplayPreviewWidth(): number {
    return this._landscapePreviewWidth;
  }

  get landscapeDisplayPreviewHeight(): number {
    return this._landscapePreviewHeight;
  }

  onLandscapePreviewLayoutChanged(args: { object: View }): void {
    // Measure the actual content cell: excludes the action bar, system bars,
    // and controls, and updates for rotation, split-screen, and the keyboard.
    const { width, height } = args.object.getActualSize();
    if (width <= 0 || height <= 0) return;
    const previewHeight = Math.min(height, width / LENS_ASPECT_RATIO);
    const previewWidth = previewHeight * LENS_ASPECT_RATIO;
    if (previewWidth === this._landscapePreviewWidth && previewHeight === this._landscapePreviewHeight) return;
    this._landscapePreviewWidth = previewWidth;
    this._landscapePreviewHeight = previewHeight;
    this.notifyPropertyChange("landscapeDisplayPreviewWidth", previewWidth);
    this.notifyPropertyChange("landscapeDisplayPreviewHeight", previewHeight);
  }

  /** Near-full-width on phones, capped on tablets (the 32 clears the 16 margins). */
  get warningsModalWidth(): number {
    return Math.min(Screen.mainScreen.widthDIPs - 32, 480);
  }

  /**
   * The simulated watch face (and the Back/Menu row under it) is capped at a
   * 1.5:1 face aspect; on narrow phones the available width governs instead.
   */
  get watchFaceWidth(): number {
    // Must match .touchpad height in app.css.
    const faceHeight = 230;
    const available =
      this._layoutOrientation === "landscape"
        ? 345 // Matches the unpadded landscape controls column in main-page.xml.
        : Screen.mainScreen.widthDIPs - 56; // p-20 padding + controls margins
    return Math.min(available, Math.round(faceHeight * 1.5));
  }

  get watchFaceHeight(): number {
    return Math.min(230, Math.max(0, this._controlsContentHeight - 2));
  }

  get ringTouchpadHeight(): number {
    return Math.min(250, Math.max(0, this._controlsContentHeight - 2));
  }

  onControlsContentLayoutChanged(args: { object: View }): void {
    const { height } = args.object.getActualSize();
    if (height <= 0 || height === this._controlsContentHeight) return;
    this._controlsContentHeight = height;
    this.notifyPropertyChange("watchFaceHeight", this.watchFaceHeight);
    this.notifyPropertyChange("ringTouchpadHeight", this.ringTouchpadHeight);
  }

  get portraitLayoutVisibility(): "visible" | "collapse" {
    return this._layoutOrientation === "portrait" ? "visible" : "collapse";
  }

  get landscapeLayoutVisibility(): "visible" | "collapse" {
    return this._layoutOrientation === "landscape" ? "visible" : "collapse";
  }

  refreshLayoutMetrics(): void {
    const nextOrientation = this.readLayoutOrientation();
    if (this._layoutOrientation !== nextOrientation) {
      this._layoutOrientation = nextOrientation;
      this.notifyPropertyChange("portraitLayoutVisibility", this.portraitLayoutVisibility);
      this.notifyPropertyChange("landscapeLayoutVisibility", this.landscapeLayoutVisibility);
    }
    this.notifyPropertyChange("displayPreviewHeight", this.displayPreviewHeight);
    this.notifyPropertyChange("landscapeDisplayPreviewWidth", this.landscapeDisplayPreviewWidth);
    this.notifyPropertyChange("landscapeDisplayPreviewHeight", this.landscapeDisplayPreviewHeight);
    this.notifyPropertyChange("warningsModalWidth", this.warningsModalWidth);
    this.notifyPropertyChange("watchFaceWidth", this.watchFaceWidth);
  }

  get activeTextSettingId(): string | null {
    return this._activeTextSettingId;
  }

  set activeTextSettingId(value: string | null) {
    if (this._activeTextSettingId !== value) {
      this._activeTextSettingId = value;
      this.notifyPropertyChange("activeTextSettingId", value);
      this.notifyPropertyChange("textSettingEditorVisibility", this.textSettingEditorVisibility);
      this.notifyPropertyChange("isTextSettingEditorActive", this.isTextSettingEditorActive);
      // Keyboard-input mode: the tabbed controls make way for the editor.
      this.notifyPropertyChange("controlsVisibility", this.controlsVisibility);
    }
  }

  get activeTextSettingTitle(): string {
    return this._activeTextSettingTitle;
  }

  get activeTextEditorTitle(): string {
    return this._activeTextEditorTitle;
  }

  set activeTextEditorTitle(value: string) {
    if (this._activeTextEditorTitle !== value) {
      this._activeTextEditorTitle = value;
      this.notifyPropertyChange("activeTextEditorTitle", value);
    }
  }

  set activeTextSettingTitle(value: string) {
    if (this._activeTextSettingTitle !== value) {
      this._activeTextSettingTitle = value;
      this.notifyPropertyChange("activeTextSettingTitle", value);
    }
  }

  get activeTextSettingValue(): string {
    return this._activeTextSettingValue;
  }

  set activeTextSettingValue(value: string) {
    if (this._activeTextSettingValue !== value) {
      this._activeTextSettingValue = value;
      this.notifyPropertyChange("activeTextSettingValue", value);
    }
  }

  get activeTextSettingInputKind(): "text" | "email" | "password" {
    return this._activeTextSettingInputKind;
  }

  set activeTextSettingInputKind(value: "text" | "email" | "password") {
    if (this._activeTextSettingInputKind !== value) {
      this._activeTextSettingInputKind = value;
      this.notifyPropertyChange("activeTextSettingKeyboardType", this.activeTextSettingKeyboardType);
      this.notifyPropertyChange("activeTextSettingSecure", this.activeTextSettingSecure);
    }
  }

  get activeTextSettingKeyboardType(): "email" | "text" {
    return this._activeTextSettingInputKind === "email" ? "email" : "text";
  }

  get activeTextSettingSecure(): boolean {
    return this._activeTextSettingInputKind === "password";
  }

  get secondaryTextSettingId(): string | null {
    return this._secondaryTextSettingId;
  }

  set secondaryTextSettingId(value: string | null) {
    if (this._secondaryTextSettingId !== value) {
      this._secondaryTextSettingId = value;
      this.notifyPropertyChange("secondaryTextSettingId", value);
      this.notifyPropertyChange("secondaryTextSettingVisibility", this.secondaryTextSettingVisibility);
      this.notifyPropertyChange("hasSecondaryTextSetting", this.hasSecondaryTextSetting);
      this.notifyPropertyChange("primaryTextSettingReturnKeyType", this.primaryTextSettingReturnKeyType);
    }
  }

  get secondaryTextSettingTitle(): string {
    return this._secondaryTextSettingTitle;
  }

  set secondaryTextSettingTitle(value: string) {
    if (this._secondaryTextSettingTitle !== value) {
      this._secondaryTextSettingTitle = value;
      this.notifyPropertyChange("secondaryTextSettingTitle", value);
    }
  }

  get secondaryTextSettingValue(): string {
    return this._secondaryTextSettingValue;
  }

  set secondaryTextSettingValue(value: string) {
    if (this._secondaryTextSettingValue !== value) {
      this._secondaryTextSettingValue = value;
      this.notifyPropertyChange("secondaryTextSettingValue", value);
    }
  }

  get secondaryTextSettingInputKind(): "text" | "email" | "password" {
    return this._secondaryTextSettingInputKind;
  }

  set secondaryTextSettingInputKind(value: "text" | "email" | "password") {
    if (this._secondaryTextSettingInputKind !== value) {
      this._secondaryTextSettingInputKind = value;
      this.notifyPropertyChange("secondaryTextSettingKeyboardType", this.secondaryTextSettingKeyboardType);
      this.notifyPropertyChange("secondaryTextSettingSecure", this.secondaryTextSettingSecure);
    }
  }

  get secondaryTextSettingKeyboardType(): "email" | "text" {
    return this._secondaryTextSettingInputKind === "email" ? "email" : "text";
  }

  get secondaryTextSettingSecure(): boolean {
    return this._secondaryTextSettingInputKind === "password";
  }

  get hasSecondaryTextSetting(): boolean {
    return this._secondaryTextSettingId !== null;
  }

  get secondaryTextSettingVisibility(): "visible" | "collapse" {
    return this.hasSecondaryTextSetting ? "visible" : "collapse";
  }

  get primaryTextSettingReturnKeyType(): "next" | "done" {
    return this.hasSecondaryTextSetting ? "next" : "done";
  }

  get activeTextEditorToggleLabel(): string {
    return this._activeTextEditorToggleLabel;
  }

  set activeTextEditorToggleLabel(value: string) {
    if (this._activeTextEditorToggleLabel !== value) {
      this._activeTextEditorToggleLabel = value;
      this.notifyPropertyChange("activeTextEditorToggleLabel", value);
    }
  }

  get activeTextEditorToggleValue(): boolean {
    return this._activeTextEditorToggleValue;
  }

  set activeTextEditorToggleValue(value: boolean) {
    if (this._activeTextEditorToggleValue !== value) {
      this._activeTextEditorToggleValue = value;
      this.notifyPropertyChange("activeTextEditorToggleValue", value);
    }
  }

  get activeTextEditorToggleVisible(): boolean {
    return this._activeTextEditorToggleVisible;
  }

  set activeTextEditorToggleVisible(value: boolean) {
    if (this._activeTextEditorToggleVisible !== value) {
      this._activeTextEditorToggleVisible = value;
      this.notifyPropertyChange("activeTextEditorToggleVisibility", this.activeTextEditorToggleVisibility);
    }
  }

  get activeTextEditorToggleVisibility(): "visible" | "collapse" {
    return this._activeTextEditorToggleVisible ? "visible" : "collapse";
  }

  get isTextSettingEditorActive(): boolean {
    return this._activeTextSettingId !== null;
  }

  get textSettingEditorVisibility(): "visible" | "collapse" {
    return this.isTextSettingEditorActive ? "visible" : "collapse";
  }

  // ---- keyboard-input panel (the keyboard button beside the mic button) ----
  //
  // The dialog lives on the glasses (ui/shell/keyboard-input.ts); this panel
  // is the phone's end of it: the text field the IME types into and a send
  // button per destination. The field's text is the panel's own state, never
  // echoed back from the controller (see setActiveTextSettingValue for why);
  // it is cleared whenever a dialog opens or closes.

  get keyboardInputActive(): boolean {
    return this._keyboardInputActive;
  }

  set keyboardInputActive(value: boolean) {
    if (this._keyboardInputActive === value) return;
    this._keyboardInputActive = value;
    this.keyboardInputText = "";
    this.notifyPropertyChange("keyboardInputActive", value);
    this.notifyPropertyChange("keyboardInputVisibility", this.keyboardInputVisibility);
    this.notifyPropertyChange("controlsVisibility", this.controlsVisibility);
  }

  get keyboardInputVisibility(): "visible" | "collapse" {
    return this._keyboardInputActive ? "visible" : "collapse";
  }

  get keyboardInputText(): string {
    return this._keyboardInputText;
  }

  set keyboardInputText(value: string) {
    if (this._keyboardInputText === value) return;
    this._keyboardInputText = value;
    this.notifyPropertyChange("keyboardInputText", value);
  }

  set keyboardInputTargets(value: ReadonlyArray<{ id: string; label: string }>) {
    this._keyboardInputTargets = value;
    this.notifyPropertyChange("keyboardInputPrimaryTargetLabel", this.keyboardInputPrimaryTargetLabel);
    this.notifyPropertyChange("keyboardInputPrimaryTargetVisibility", this.keyboardInputPrimaryTargetVisibility);
    this.notifyPropertyChange("keyboardInputSecondaryTargetLabel", this.keyboardInputSecondaryTargetLabel);
    this.notifyPropertyChange("keyboardInputSecondaryTargetVisibility", this.keyboardInputSecondaryTargetVisibility);
  }

  // The glasses menu has at most two destinations (assistant, app), so the
  // panel has a fixed pair of buttons rather than a repeater.
  get keyboardInputPrimaryTargetLabel(): string {
    return this._keyboardInputTargets[0]?.label ?? "";
  }

  get keyboardInputPrimaryTargetVisibility(): "visible" | "collapse" {
    return this._keyboardInputTargets[0] ? "visible" : "collapse";
  }

  get keyboardInputSecondaryTargetLabel(): string {
    return this._keyboardInputTargets[1]?.label ?? "";
  }

  get keyboardInputSecondaryTargetVisibility(): "visible" | "collapse" {
    return this._keyboardInputTargets[1] ? "visible" : "collapse";
  }

  onKeyboardTap(): void {
    dashboardController.startKeyboardInput();
  }

  onKeyboardInputTextChange(args: { value?: string; object?: { text?: string } }): void {
    const text = args.object?.text ?? args.value ?? "";
    // Track the draft so closing the dialog emits a clear even when the
    // binding hasn't updated the model. Avoid echoing edits into the IME.
    this._keyboardInputText = text;
    dashboardController.setKeyboardInputText(text);
  }

  onKeyboardInputPrimarySendTap(): void {
    const target = this._keyboardInputTargets[0];
    if (target) dashboardController.sendKeyboardInput(target.id);
  }

  onKeyboardInputSecondarySendTap(): void {
    const target = this._keyboardInputTargets[1];
    if (target) dashboardController.sendKeyboardInput(target.id);
  }

  onKeyboardInputDiscardTap(): void {
    dashboardController.discardKeyboardInput();
  }

  get evenAppConflictMessage(): string {
    return this._evenAppConflictMessage;
  }

  set evenAppConflictMessage(value: string) {
    if (this._evenAppConflictMessage !== value) {
      this._evenAppConflictMessage = value;
      this.notifyPropertyChange("evenAppConflictMessage", value);
    }
  }

  get evenAppConflictWarningVisible(): boolean {
    return this._evenAppConflictWarningVisible;
  }

  set evenAppConflictWarningVisible(value: boolean) {
    if (this._evenAppConflictWarningVisible !== value) {
      this._evenAppConflictWarningVisible = value;
      this.notifyPropertyChange("evenAppConflictWarningVisible", value);
      this.notifyPropertyChange("evenAppConflictWarningVisibility", this.evenAppConflictWarningVisibility);
      this.refreshWarningIndicator();
    }
  }

  get evenAppConflictWarningVisibility(): "visible" | "collapse" {
    return this._evenAppConflictWarningVisible ? "visible" : "collapse";
  }

  get firmwareWarningMessage(): string {
    return this._firmwareWarningMessage;
  }

  set firmwareWarningMessage(value: string) {
    if (this._firmwareWarningMessage !== value) {
      this._firmwareWarningMessage = value;
      this.notifyPropertyChange("firmwareWarningMessage", value);
    }
  }

  get firmwareWarningVisible(): boolean {
    return this._firmwareWarningVisible;
  }

  set firmwareWarningVisible(value: boolean) {
    if (this._firmwareWarningVisible !== value) {
      this._firmwareWarningVisible = value;
      this.notifyPropertyChange("firmwareWarningVisible", value);
      this.notifyPropertyChange("firmwareWarningVisibility", this.firmwareWarningVisibility);
      this.refreshWarningIndicator();
    }
  }

  get firmwareWarningVisibility(): "visible" | "collapse" {
    return this._firmwareWarningVisible ? "visible" : "collapse";
  }

  get screenRecordingActive(): boolean {
    return this._screenRecordingActive;
  }

  set screenRecordingActive(value: boolean) {
    if (this._screenRecordingActive !== value) {
      this._screenRecordingActive = value;
      this.notifyPropertyChange("screenRecordingActive", value);
      this.notifyPropertyChange("stopRecordingButtonVisibility", this.stopRecordingButtonVisibility);
    }
  }

  get stopRecordingButtonVisibility(): "visible" | "collapse" {
    return this._screenRecordingActive ? "visible" : "collapse";
  }

  onTakeScreenshotTap(): void {
    try {
      dashboardController.saveScreenshot();
    } catch (error) {
      console.error("screenshot failed", error);
    }
  }

  onRecordScreenTap(): void {
    try {
      dashboardController.startScreenRecording();
    } catch (error) {
      console.error("screen recording start failed", error);
    }
  }

  onStopRecordingTap(): void {
    try {
      dashboardController.stopScreenRecording();
    } catch (error) {
      console.error("screen recording stop failed", error);
    }
  }

  get batteryOptimizationWarningVisible(): boolean {
    return this._batteryOptimizationWarningVisible;
  }

  set batteryOptimizationWarningVisible(value: boolean) {
    if (this._batteryOptimizationWarningVisible !== value) {
      this._batteryOptimizationWarningVisible = value;
      this.notifyPropertyChange("batteryOptimizationWarningVisible", value);
      this.notifyPropertyChange("batteryOptimizationWarningVisibility", this.batteryOptimizationWarningVisibility);
      this.refreshWarningIndicator();
    }
  }

  get batteryOptimizationWarningVisibility(): "visible" | "collapse" {
    return this._batteryOptimizationWarningVisible ? "visible" : "collapse";
  }

  get fontsMissingWarningVisible(): boolean {
    return this._fontsMissingWarningVisible;
  }

  set fontsMissingWarningVisible(value: boolean) {
    if (this._fontsMissingWarningVisible !== value) {
      this._fontsMissingWarningVisible = value;
      this.notifyPropertyChange("fontsMissingWarningVisible", value);
      this.notifyPropertyChange("fontsMissingWarningVisibility", this.fontsMissingWarningVisibility);
      this.refreshWarningIndicator();
    }
  }

  get fontsMissingWarningVisibility(): "visible" | "collapse" {
    return this._fontsMissingWarningVisible ? "visible" : "collapse";
  }

  /**
   * Jump back into the onboarding firmware check, whose missing-fonts path
   * downloads the stock firmware and extracts the G2 fonts without reflashing.
   * The check probes the glasses itself, so drop the main connection first;
   * like pairing, this is a detour rather than a Disconnect, so lift the
   * auto-reconnect suppression right away.
   */
  async onPrepareFontsTap(): Promise<void> {
    this.setWarningsModalVisible(false);
    if (this.phase === "connected" || this.phase === "charging" || this.phase === "connecting") {
      try {
        await dashboardController.disconnect();
      } catch {
        // proceed anyway; the firmware check reports its own connection trouble
      }
      resumeAutoReconnect();
    }
    Frame.topmost()?.navigate({ moduleName: "phone-ui/onboarding-firmware-check-page" });
  }

  onAllowBackgroundUsageTap(): void {
    this.setWarningsModalVisible(false);
    dashboardController.requestBatteryOptimizationExemption();
  }

  get alarmReliabilityMessage(): string {
    return this._alarmReliabilityMessage;
  }

  set alarmReliabilityMessage(value: string) {
    if (this._alarmReliabilityMessage !== value) {
      this._alarmReliabilityMessage = value;
      this.notifyPropertyChange("alarmReliabilityMessage", value);
      this.notifyPropertyChange("alarmReliabilityWarningVisibility", this.alarmReliabilityWarningVisibility);
      this.refreshWarningIndicator();
    }
  }

  get alarmReliabilityWarningVisibility(): "visible" | "collapse" {
    return this._alarmReliabilityMessage ? "visible" : "collapse";
  }

  onFixAlarmReliabilityTap(): void {
    this.setWarningsModalVisible(false);
    dashboardController.openAlarmReliabilityFix();
  }

  // ---- the action bar's warning triangle and the modal behind it ----

  get anyWarningVisible(): boolean {
    return (
      this._evenAppConflictWarningVisible ||
      this._firmwareWarningVisible ||
      this._batteryOptimizationWarningVisible ||
      this._fontsMissingWarningVisible ||
      this._alarmReliabilityMessage.length > 0
    );
  }

  get warningIconVisibility(): "visible" | "collapse" {
    return this.anyWarningVisible ? "visible" : "collapse";
  }

  get warningsModalVisibility(): "visible" | "collapse" {
    return this._warningsModalVisible ? "visible" : "collapse";
  }

  set evenHubPhoneUi(value: PhoneUiButton | null) {
    const current = this._evenHubPhoneUi;
    if (current?.windowId === value?.windowId && current?.icon === value?.icon) return;
    this._evenHubPhoneUi = value;
    this.notifyPropertyChange("evenHubPhoneUiIcon", this.evenHubPhoneUiIcon);
    this.notifyPropertyChange("evenHubPhoneUiVisibility", this.evenHubPhoneUiVisibility);
  }

  /** The foreground EvenHub app's icon, which opens its phone UI when tapped. */
  get evenHubPhoneUiIcon(): ImageSource | null {
    return this._evenHubPhoneUi?.icon ?? null;
  }

  get evenHubPhoneUiVisibility(): "visible" | "collapse" {
    return this._evenHubPhoneUi?.icon ? "visible" : "collapse";
  }

  onEvenHubPhoneUiTap(): void {
    const windowId = this._evenHubPhoneUi?.windowId;
    if (windowId) dashboardController.showEvenHubPhoneUi(windowId);
  }

  onWarningIconTap(): void {
    this.setWarningsModalVisible(true);
  }

  onWarningsModalCloseTap(): void {
    this.setWarningsModalVisible(false);
  }

  private setWarningsModalVisible(value: boolean): void {
    if (this._warningsModalVisible !== value) {
      this._warningsModalVisible = value;
      this.notifyPropertyChange("warningsModalVisibility", this.warningsModalVisibility);
    }
  }

  private refreshWarningIndicator(): void {
    this.notifyPropertyChange("warningIconVisibility", this.warningIconVisibility);
    // Don't leave the modal open showing nothing once the last warning clears.
    if (!this.anyWarningVisible) {
      this.setWarningsModalVisible(false);
    }
  }

  get phase(): "disconnected" | "connecting" | "connected" | "charging" | "disconnecting" {
    return this._phase;
  }

  set phase(value: "disconnected" | "connecting" | "connected" | "charging" | "disconnecting") {
    if (this._phase !== value) {
      this._phase = value;
      this.notifyPropertyChange("phase", value);
      this.notifyPropertyChange("buttonLabel", this.buttonLabel);
      this.notifyPropertyChange("canRun", this.canRun);
      this.notifyPropertyChange("connectItemEnabled", this.connectItemEnabled);
      this.notifyPropertyChange("connectionStatusLabel", this.connectionStatusLabel);
    }
  }

  get buttonLabel(): string {
    switch (this.phase) {
      case "connecting":
      case "connected":
      case "charging":
        return "Desconectar";
      case "disconnecting":
        return "Desconectando...";
      default:
        return "Conectar";
    }
  }

  get canRun(): boolean {
    return this.phase !== "connecting" && this.phase !== "disconnecting";
  }

  /**
   * Unlike the other canRun-gated menu items, Connect/Disconnect stays live
   * while connecting: Disconnect is the only way out of a reconnection-attempt
   * loop short of force-stopping the app.
   */
  get connectItemEnabled(): boolean {
    return this.phase !== "disconnecting";
  }

  async onTap(): Promise<void> {
    if (!this.connectItemEnabled) return;

    try {
      if (this.phase === "disconnected") {
        await dashboardController.connect();
      } else {
        await dashboardController.disconnect();
      }
    } catch (error) {
      const message = this.formatError(error);
      if (!this.status.startsWith("Failed:")) {
        this.status = `Failed: ${message}`;
      }
    }
  }

  /**
   * Try to connect automatically on reaching the main page. No-op if already
   * connecting/connected, if the app is in the manual-disconnected state
   * (the user picked Disconnect, the flash flow owns the glasses, or the
   * firmware was found incompatible), or if no glasses are configured
   * (e.g. preview-only users, who have nothing to connect to).
   */
  async autoConnect(): Promise<void> {
    if (this.phase !== "disconnected") return;
    // Preview-only users get the headless preview display instead of a
    // connection; a no-op in every other state (including while suppressed:
    // suppression is about not re-dialing glasses, and there are none).
    await dashboardController.ensurePreviewDisplay();
    if (isAutoReconnectSuppressed()) return;
    const addresses = loadDeviceAddresses();
    if (!isValidMacAddress(addresses.right) || !isValidMacAddress(addresses.left)) return;
    try {
      await dashboardController.connect();
    } catch {
      // The controller surfaces failures via status/log; nothing to add here.
    }
  }

  onPermissionsTap(): void {
    Frame.topmost()?.navigate({
      moduleName: "phone-ui/permissions-page",
      context: { onboarding: false },
    });
  }

  /** Review saved caption sessions; works without a glasses connection. */
  onConversationsTap(): void {
    Frame.topmost()?.navigate("phone-ui/conversations-page");
  }

  /**
   * Preview-only users have no glasses paired, so the Connect and Uninstall
   * menu items have nothing to act on; hide them until pairing completes.
   * The view model is rebuilt on every visit to the main page, so this picks
   * up the mode change when pairing/flashing returns here.
   */
  get glassesMenuItemsVisibility(): "visible" | "collapse" {
    return isPreviewOnlyMode() ? "collapse" : "visible";
  }

  /**
   * Live scan that names each nearby pair by model, colour, and serial and
   * checks both arms belong together. A connected arm stops advertising, so
   * drop the current link first. disconnect() enters the manual-disconnected
   * state; pairing is a detour, not a Disconnect, so lift the suppression
   * right away — nothing dials the glasses until the main page's autoConnect
   * runs again on the way back.
   *
   * In preview-only mode there are no glasses yet, so pairing is really the
   * rest of onboarding: re-enter that chain at its "Disconnect Other Apps"
   * step, which leads to the scan, the firmware check, and flashing. The
   * chain's Back buttons pop history, so its first page returns here.
   */
  async onPairGlassesTap(): Promise<void> {
    if (!this.canRun) return;
    if (isPreviewOnlyMode()) {
      Frame.topmost()?.navigate({ moduleName: "phone-ui/onboarding-unpair-page" });
      return;
    }
    if (this.phase === "connected" || this.phase === "charging" || this.phase === "connecting") {
      try {
        await dashboardController.disconnect();
      } catch {
        // proceed anyway; the pairing page reports what it hears
      }
      resumeAutoReconnect();
    }
    Frame.topmost()?.navigate({ moduleName: "phone-ui/pairing-page", context: { onboarding: false } });
  }

  async onInstallFirmwareTap(): Promise<void> {
    this.setWarningsModalVisible(false);
    await this.openFlashPage("install");
  }

  async onUninstallFirmwareTap(): Promise<void> {
    await this.openFlashPage("uninstall");
  }

  private async openFlashPage(mode: "install" | "uninstall"): Promise<void> {
    // The flasher needs the glasses to itself, so drop the main connection first.
    if (this.phase === "connected" || this.phase === "charging") {
      try {
        await dashboardController.disconnect();
      } catch {
        // proceed anyway; the flash page surfaces any connection trouble
      }
    }
    Frame.topmost()?.navigate({
      moduleName: "phone-ui/onboarding-flash-page",
      context: { mode, fromOnboarding: false },
    });
  }

  onTextSettingTextChange(args: { value?: string; object?: { text?: string } }): void {
    dashboardController.setActiveTextSettingValue(
      args.object?.text ?? args.value ?? "",
      this.activeTextSettingId ?? undefined,
    );
  }

  onPrimaryTextSettingReturnPress(args: { object?: { text?: string; page?: { getViewById?: (id: string) => { focus?: () => void } | null } } }): void {
    // Commit the field's actual text at done-time, in case the final
    // keystroke's textChange hadn't landed yet.
    const text = args?.object?.text;
    if (typeof text === "string") {
      dashboardController.setActiveTextSettingValue(text, this.activeTextSettingId ?? undefined);
    }
    if (this.hasSecondaryTextSetting) {
      args.object?.page?.getViewById?.("secondarySettingsTextField")?.focus?.();
      return;
    }
    dashboardController.finishActiveTextSettingEdit();
  }

  onSecondaryTextSettingTextChange(args: { value?: string; object?: { text?: string } }): void {
    dashboardController.setActiveTextSettingValue(
      args.object?.text ?? args.value ?? "",
      this.secondaryTextSettingId ?? undefined,
    );
  }

  onSecondaryTextSettingReturnPress(args: { object?: { text?: string } }): void {
    const text = args?.object?.text;
    if (typeof text === "string") {
      dashboardController.setActiveTextSettingValue(text, this.secondaryTextSettingId ?? undefined);
    }
    dashboardController.finishActiveTextSettingEdit();
  }

  /** The editor's Submit button: the same as the done key on the last field. */
  onTextSettingSubmitTap(args: { object?: View }): void {
    // Commit both fields' actual text, in case a final keystroke's textChange
    // hadn't landed yet (as the return-press handlers do).
    const page = args?.object?.page;
    const primaryText = page?.getViewById<TextField>("settingsTextField")?.text;
    if (typeof primaryText === "string") {
      dashboardController.setActiveTextSettingValue(primaryText, this.activeTextSettingId ?? undefined);
    }
    const secondaryText = page?.getViewById<TextField>("secondarySettingsTextField")?.text;
    if (this.hasSecondaryTextSetting && typeof secondaryText === "string") {
      dashboardController.setActiveTextSettingValue(secondaryText, this.secondaryTextSettingId ?? undefined);
    }
    dashboardController.finishActiveTextSettingEdit();
  }

  onTextSettingCancelTap(): void {
    dashboardController.cancelActiveTextSettingEdit();
  }

  onTextSettingToggleChange(args: { value?: boolean; object?: { checked?: boolean } }): void {
    dashboardController.setActiveTextEditorToggleValue(
      args.object?.checked ?? args.value ?? false,
    );
  }

  onOpenEvenAppSettingsTap(): void {
    this.setWarningsModalVisible(false);
    dashboardController.openEvenAppSettings();
  }

  // Tap-then-hold on the simulated pads: NativeScript reports doubleTap on
  // the second finger-down and still runs the long-press recognizer on that
  // same press, so the sequence arrives as doubleTap followed by longPress.
  // Each pad therefore defers its double-click until the finger-up (the touch
  // handler) and converts the deferred pair into the G2 tap-then-hold gesture
  // when a longPress lands first.
  //
  // A hold is two events, like the hardware's: longPress sends the press
  // (long-press-start, which the controller delivers as a plain long-press)
  // and the finger-up sends the release, so a hold really holds (the
  // Glanceboard stays up until the finger lifts). The firmware sends the
  // same release after a tap-then-hold, so that pair gets one too.
  //
  // Every finger-down (the second tap of a pair included) first sends a
  // ring-press, as the ring does before it knows what the touch will become.

  private ringPadDoubleTapPending = false;
  private ringPadHeld = false;

  async onRingPadTap(): Promise<void> {
    await dashboardController.injectSyntheticRingInput("click");
  }

  async onRingPadDoubleTap(): Promise<void> {
    this.ringPadDoubleTapPending = true;
  }

  async onRingPadLongPress(): Promise<void> {
    const kind = this.ringPadDoubleTapPending ? "short-then-long-press" : "long-press-start";
    this.ringPadDoubleTapPending = false;
    this.ringPadHeld = true;
    await dashboardController.injectSyntheticRingInput(kind);
  }

  async onRingPadTouch(args: TouchGestureEventData): Promise<void> {
    if (args.action === "down" && args.getPointerCount() === 1) {
      await dashboardController.injectSyntheticRingInput("ring-press");
      return;
    }
    if (args.action !== "up" && args.action !== "cancel") return;
    const pending = this.ringPadDoubleTapPending;
    this.ringPadDoubleTapPending = false;
    if (this.ringPadHeld) {
      this.ringPadHeld = false;
      await dashboardController.injectSyntheticRingInput("long-press-release");
      return;
    }
    if (args.action === "up" && pending) {
      await dashboardController.injectSyntheticRingInput("double-click");
    }
  }

  /** The ring pad only has a vertical axis, so left/right swipes are ignored. */
  async onRingPadSwipe(args: SwipeGestureEventData): Promise<void> {
    if (args.direction === SwipeDirection.up) {
      await dashboardController.injectSyntheticRingInput("scroll-up");
    } else if (args.direction === SwipeDirection.down) {
      await dashboardController.injectSyntheticRingInput("scroll-down");
    }
  }

  async onSyntheticMicTap(): Promise<void> {
    await dashboardController.injectSyntheticRingInput("wakeword");
  }

  // ---- the phone's own controller: touchpad, d-pad, mirror touch ----
  //
  // Everything here is the watch scheme (origin "watch"): spatial swipes,
  // tap = select, double-tap / two fingers = back, hold = menu. The ring row
  // above stays on the ring's own scheme.

  private padTwoFingerDown = false;
  // See the ring pad above: defers the double-click so a longPress can turn
  // the pair into tap-then-hold, and pairs every hold with a release.
  private padDoubleTapPending = false;
  private padHeld = false;

  /** What the next gesture lands on, as the watch pad shows it. */
  get padFocusLine(): string {
    const focus = dashboardController.glassesDisplayLabel();
    return focus === "Display off" ? "" : focus;
  }

  private refreshPadFocusLine(): void {
    this.notifyPropertyChange("padFocusLine", this.padFocusLine);
  }

  async onPadTap(): Promise<void> {
    if (this.padTwoFingerDown) return;
    await dashboardController.injectSyntheticRingInput("click", "watch");
    this.refreshPadFocusLine();
  }

  async onPadDoubleTap(): Promise<void> {
    this.padDoubleTapPending = true;
  }

  async onPadLongPress(): Promise<void> {
    if (this.padTwoFingerDown) return;
    const kind = this.padDoubleTapPending ? "short-then-long-press" : "long-press-start";
    this.padDoubleTapPending = false;
    this.padHeld = true;
    await dashboardController.injectSyntheticRingInput(kind, "watch");
    this.refreshPadFocusLine();
  }

  async onPadSwipe(args: SwipeGestureEventData): Promise<void> {
    await dashboardController.injectSyntheticRingInput(swipeKind(args.direction), "watch");
    this.refreshPadFocusLine();
  }

  /**
   * The first finger down sends a ring-press, as the watch pad does. Two
   * fingers down and up without moving: back (the watch's two-finger tap).
   */
  async onPadTouch(args: TouchGestureEventData): Promise<void> {
    const count = args.getPointerCount();
    if (args.action === "down" || args.action === "move") {
      if (count >= 2) this.padTwoFingerDown = true;
      else if (args.action === "down") await dashboardController.injectSyntheticRingInput("ring-press", "watch");
      return;
    }
    if (args.action === "up" || args.action === "cancel") {
      const pendingDouble = this.padDoubleTapPending;
      this.padDoubleTapPending = false;
      if (this.padHeld) {
        this.padHeld = false;
        await dashboardController.injectSyntheticRingInput("long-press-release", "watch");
        this.refreshPadFocusLine();
        return;
      }
      const twoFinger = this.padTwoFingerDown;
      if (twoFinger) {
        // Let the single-tap recognizer's delayed tap see the flag first.
        setTimeout(() => {
          this.padTwoFingerDown = false;
        }, 400);
        if (args.action === "up") {
          await dashboardController.injectSyntheticRingInput("double-click", "watch");
          this.refreshPadFocusLine();
        }
      } else if (args.action === "up" && pendingDouble) {
        await dashboardController.injectSyntheticRingInput("double-click", "watch");
        this.refreshPadFocusLine();
      }
    }
  }

  // ---- touching the mirror itself ----

  // Toggled from Settings > Phone display > Touch mirror; read per gesture,
  // so no change notification is needed.
  get mirrorTouchEnabled(): boolean {
    return mirrorTouchSetting.get();
  }

  private mirrorFraction(args: GestureEventData & { getX?: () => number; getY?: () => number }): { nx: number; ny: number } | null {
    const view = args.object as View | undefined;
    const size = view?.getActualSize?.();
    if (!view || !size || !size.width || !size.height || !args.getX || !args.getY) return null;
    // NativeScript's gesture getX/getY are view-local DIPs (the view's own
    // MotionEvent coordinates), so they divide straight into the view's size.
    return { nx: args.getX() / size.width, ny: args.getY() / size.height };
  }

  private async mirrorGesture(kind: MirrorTouchKind, args: GestureEventData): Promise<void> {
    if (!this.mirrorTouchEnabled) return;
    const at = this.mirrorFraction(args) ?? { nx: 0.5, ny: 0.5 };
    await dashboardController.handleMirrorTouch(kind, at.nx, at.ny);
    this.refreshPadFocusLine();
  }

  onMirrorTap(args: GestureEventData): Promise<void> {
    return this.mirrorGesture("tap", args);
  }

  onMirrorDoubleTap(args: GestureEventData): Promise<void> {
    return this.mirrorGesture("double-tap", args);
  }

  onMirrorLongPress(args: GestureEventData): Promise<void> {
    return this.mirrorGesture("long-press", args);
  }

  onMirrorSwipe(args: SwipeGestureEventData): Promise<void> {
    return this.mirrorGesture(swipeKind(args.direction), args);
  }

  // ---- the tabbed controls area below the mirror ----
  //
  // Three tabs: Settings (screen size + brightness), Watch (the simulated
  // watch face), Ring (simulated R1 inputs). The whole area collapses while a
  // text setting is being edited so the editor gets the space instead.

  get controlsVisibility(): "visible" | "collapse" {
    return this.isTextSettingEditorActive || this._keyboardInputActive ? "collapse" : "visible";
  }

  // ---- BLE bandwidth indicator (Settings > Developer > Show BLE bandwidth usage) ----
  //
  // A running total of outbound BLE messages/bytes, overlaid at the bottom of
  // the page on every tab. Polled from the Java-side counters while enabled.

  private _bleBandwidthLabel = "";
  private bleBandwidthTimer: ReturnType<typeof setInterval> | null = null;
  // Recent counter samples, one per poll tick, for the windowed rates.
  private readonly bleBandwidthMeter = new BleBandwidthMeter();

  get bleBandwidthVisibility(): "visible" | "collapse" {
    return showBleBandwidthSetting.get() ? "visible" : "collapse";
  }

  get bleBandwidthLabel(): string {
    return this._bleBandwidthLabel;
  }

  /** Start or stop the poll to match the setting; safe to call repeatedly. */
  private syncBleBandwidthPolling(): void {
    const enabled = showBleBandwidthSetting.get();
    if (enabled && this.bleBandwidthTimer === null) {
      this.refreshBleBandwidth();
      this.bleBandwidthTimer = setInterval(() => this.refreshBleBandwidth(), 1000);
      this.notifyPropertyChange("bleBandwidthVisibility", this.bleBandwidthVisibility);
    } else if (!enabled && this.bleBandwidthTimer !== null) {
      this.stopBleBandwidthPolling();
      this.notifyPropertyChange("bleBandwidthVisibility", this.bleBandwidthVisibility);
    }
  }

  private stopBleBandwidthPolling(): void {
    if (this.bleBandwidthTimer !== null) {
      clearInterval(this.bleBandwidthTimer);
      this.bleBandwidthTimer = null;
    }
    // Don't let a later re-enable compute a rate across the disabled gap.
    this.bleBandwidthMeter.reset();
  }

  private refreshBleBandwidth(): void {
    let label: string;
    try {
      label = this.bleBandwidthMeter.sample(sampleBleTraffic(), Date.now());
    } catch (error) {
      label = `BLE sent: ${this.formatError(error)}`;
    }
    if (label !== this._bleBandwidthLabel) {
      this._bleBandwidthLabel = label;
      this.notifyPropertyChange("bleBandwidthLabel", label);
    }
  }

  private readLayoutOrientation(): LayoutOrientation {
    const applicationOrientation = Application.orientation();
    if (applicationOrientation === "landscape" || applicationOrientation === "portrait") {
      return applicationOrientation;
    }
    return Screen.mainScreen.widthDIPs > Screen.mainScreen.heightDIPs ? "landscape" : "portrait";
  }

  private formatError(error: unknown): string {
    return formatErrorMessage(error, 240);
  }
}

/** NativeScript swipe direction -> the watch-scheme directional gesture. */
function swipeKind(direction: SwipeDirection): "swipe-up" | "swipe-down" | "swipe-left" | "swipe-right" {
  switch (direction) {
    case SwipeDirection.up:
      return "swipe-up";
    case SwipeDirection.down:
      return "swipe-down";
    case SwipeDirection.left:
      return "swipe-left";
    default:
      return "swipe-right";
  }
}
