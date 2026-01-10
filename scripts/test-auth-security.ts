import { describe, expect, test } from "bun:test";

const API_URL = "http://localhost:3001/api/auth";

// Unique user for this test run
const TEST_USER = {
  email: `security_test_${Date.now()}@example.com`,
  password: "securePassword123!",
  displayName: `SecTest ${Date.now()}`,
};

let capturedToken = "";

console.log("🔒 Starting Security Hardening Auth Tests...");
console.log(`🎯 Target: ${API_URL}`);

async function request(endpoint: string, method = "GET", body?: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (e) {
    return { status: 500, data: { error: "Connection refused" } };
  }
}

// 1. Register
const reg = await request("/register", "POST", TEST_USER);
if (reg.status === 201) {
  console.log("✅ Register: Success");
  if (!reg.data.token.startsWith("pk_dj_")) {
    console.error("❌ Register: Token format invalid (should start with pk_dj_)");
    process.exit(1);
  }
  if (reg.data.token.length < 30) {
    console.error("❌ Register: Token too short (suspiciously simple)");
    process.exit(1);
  }
  capturedToken = reg.data.token;
  console.log(`   Token: ${capturedToken.substring(0, 15)}...`);
} else {
  console.error("❌ Register: Failed", reg);
  process.exit(1);
}

// 2. Validate (Me)
const me = await request("/me", "GET", undefined, capturedToken);
if (me.status === 200 && me.data.user.email === TEST_USER.email) {
  console.log("✅ Validate (/me): Success - Token accepted");
} else {
  console.error("❌ Validate: Failed", me);
  process.exit(1);
}

// 3. Login (Should generate NEW token)
const login = await request("/login", "POST", {
  email: TEST_USER.email,
  password: TEST_USER.password,
});

if (login.status === 200) {
  const newToken = login.data.token;
  if (newToken === capturedToken) {
    console.error("❌ Login: Security Fail - Token was NOT rotated!");
    console.error("   (Login should always generate a fresh token)");
    process.exit(1);
  }
  console.log("✅ Login: Success - Token rotated (New token generated)");
  capturedToken = newToken; // Update to use new token
} else {
  console.error("❌ Login: Failed", login);
  process.exit(1);
}

// 4. Regenerate Token
const regen = await request("/regenerate-token", "POST", undefined, capturedToken);
if (regen.status === 200) {
  const regenToken = regen.data.token;
  if (regenToken === capturedToken) {
    console.error("❌ Regen: Security Fail - Token did not change!");
    process.exit(1);
  }
  console.log("✅ Regenerate: Success - Token changed");

  // Verify OLD token is dead
  const oldCheck = await request("/me", "GET", undefined, capturedToken);
  if (oldCheck.status === 401) {
    console.log("✅ Regenerate: Old token successfully invalidated");
  } else {
    console.error("❌ Regenerate: Old token STILL WORKING (Zombie token!)");
    process.exit(1);
  }
} else {
  console.error("❌ Regenerate: Failed", regen);
  process.exit(1);
}

console.log("\n🎉 All Security Tests Passed!");
