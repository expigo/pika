import { eq } from "drizzle-orm";
import webpush, { type PushSubscription } from "web-push";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { logger } from "@pika/shared";

// 11/10 Architecture: Fail-safe initialization
const publicKey = process.env["VAPID_PUBLIC_KEY"];
const privateKey = process.env["VAPID_PRIVATE_KEY"];
const subject = process.env["VAPID_SUBJECT"] || "mailto:admin@pika.stream";

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    logger.info("[Push] VAPID initialized");
  } catch (e) {
    logger.error("[Push] Failed to set VAPID details", e);
  }
} else {
  logger.warn("[Push] VAPID keys missing in env. Push notifications will fail.");
}

export type PikaPushSubscription = typeof pushSubscriptions.$inferSelect;

export class PushService {
  /**
   * Send a notification to a specific subscription.
   * Handles 410 Gone / 404 Not Found by marking as unsubscribed.
   * Returns true if sent successfully, false otherwise.
   */
  static async send(
    subscription: PikaPushSubscription,
    payload: string | Buffer,
  ): Promise<boolean> {
    if (!publicKey || !privateKey) {
      logger.warn("[Push] Attempted to send without VAPID keys");
      return false;
    }

    // Construct standard PushSubscription object expected by web-push
    const pushSub: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, payload);
      return true;
    } catch (error: any) {
      // 11/10 Reliability: Auto-clean dead subscriptions
      if (error.statusCode === 410 || error.statusCode === 404) {
        logger.info("[Push] Subscription expired (410/404), marking as unsubscribed", {
          endpoint: subscription.endpoint.substring(0, 20) + "...",
        });

        try {
          await db
            .update(pushSubscriptions)
            .set({ unsubscribedAt: new Date() })
            .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        } catch (dbError) {
          logger.error("[Push] Failed to mark subscription as unsubscribed", dbError);
        }
        return false;
      }

      logger.error("[Push] Send failed", {
        statusCode: error.statusCode,
        endpoint: subscription.endpoint.substring(0, 20) + "...",
      });
      return false;
    }
  }
}
