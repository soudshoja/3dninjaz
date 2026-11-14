import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { sendOrderDeliveredEmail } from "@/actions/send-emails";
import { formatOrderNumber } from "@/lib/orders";
import { sendWhatsAppNotification } from "@/lib/whatsapp/sender";
import { publicUrl } from "@/lib/public-url";

/**
 * Fire-and-forget customer notifications for a delivered order. Kept in its
 * own tiny file so the call shapes live in one place. Never throws, never
 * awaited by callers; the status flip has already been committed.
 */
export function notifyOrderDelivered(orderId: string): void {
  void (async () => {
    const rows = await db
      .select({
        id: orders.id,
        customerEmail: orders.customerEmail,
        shippingName: orders.shippingName,
        shippingPhone: orders.shippingPhone,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const order = rows[0];
    if (!order) return;

    void sendOrderDeliveredEmail({
      customerEmail: order.customerEmail,
      customerName: order.shippingName,
      orderNumber: formatOrderNumber(order.id),
      orderId: order.id,
    }).catch((err) => console.error("[order-delivery] delivery email failed:", err));
    void sendWhatsAppNotification("order_delivered", order.shippingPhone, {
      customerName: order.shippingName,
      orderId: order.id,
      orderNumber: formatOrderNumber(order.id),
      orderUrl: publicUrl(`/orders/${order.id}`),
    }).catch(() => {});
  })().catch((err) => console.error("[order-delivery] notify failed:", err));
}
