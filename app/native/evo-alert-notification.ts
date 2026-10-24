import { Utils } from "@nativescript/core";

declare const com: any;

/** Own channel, separate from the low-importance connection status, so the alert can sound. */
const CHANNEL_ID = "faceclaw-evo-status";
/** Fixed id: the recovery notice replaces the outage notice instead of piling up. */
const NOTIFICATION_ID = 7301;

function ensureChannel(context: android.content.Context): void {
  if (android.os.Build.VERSION.SDK_INT < 26) return;
  const manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager;
  if (!manager || manager.getNotificationChannel(CHANNEL_ID)) return;
  const channel = new android.app.NotificationChannel(CHANNEL_ID, "Estado del EVO-X2",
    android.app.NotificationManager.IMPORTANCE_HIGH);
  channel.setDescription("Avisa si el EVO-X2 deja de ser accesible desde este móvil.");
  manager.createNotificationChannel(channel);
}

/** Phone notification for the EVO watchdog. Never throws: an alert path must not break the shell. */
export function postEvoAlertNotification(text: string): void {
  if (!global.isAndroid) return;
  try {
    const context = Utils.android.getApplicationContext();
    if (!context) return;
    ensureChannel(context);
    const launch = new android.content.Intent(context, com.tns.NativeScriptActivity.class);
    launch.addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    const pending = android.app.PendingIntent.getActivity(context, NOTIFICATION_ID, launch,
      android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
    const builder = android.os.Build.VERSION.SDK_INT >= 26
      ? new android.app.Notification.Builder(context, CHANNEL_ID)
      : new android.app.Notification.Builder(context);
    const notification = builder
      .setContentTitle("EVO-X2")
      .setContentText(text)
      .setStyle(new android.app.Notification.BigTextStyle().bigText(text))
      .setSmallIcon(context.getApplicationInfo().icon)
      .setContentIntent(pending)
      .setAutoCancel(true)
      .build();
    const manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager;
    manager?.notify(NOTIFICATION_ID, notification);
  } catch (error) {
    console.warn(`evo alert notification failed: ${error}`);
  }
}
