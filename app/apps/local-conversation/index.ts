import { type AppDefinition } from "../app-definition";
import { createLocalConversationWindow, CONVERSATION_WINDOW_ID, CONVERSATION_SURFACE_ID } from "./local-conversation-app";

const localConversationApp: AppDefinition = {
  appId: "local-conversation",
  title: "Conversación local",
  icon: "message-circle",
  launch: (ctx) => ctx.launchInProcessApp(CONVERSATION_WINDOW_ID, CONVERSATION_SURFACE_ID, createLocalConversationWindow),
};
export default localConversationApp;
