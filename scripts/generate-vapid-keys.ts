import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("\n==================================");
console.log("🚀 VAPID Keys Generated");
console.log("==================================\n");
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(
  "\nAdd these to your .env file in packages/cloud and packages/web (only public key for web)\n",
);
