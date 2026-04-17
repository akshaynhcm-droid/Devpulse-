import { eq } from "drizzle-orm";
import { users, type InsertUser } from "../../../drizzle/schema";
import { getDb } from "..";
import { sendWelcomeEmail } from "../../email";

export async function upsertUser(
  user: InsertUser
): Promise<{ isNew: boolean }> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return { isNew: false };
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        name: user.name,
        email: user.email,
        lastSignedIn: new Date(),
      })
      .where(eq(users.openId, user.openId));
    return { isNew: false };
  }

  await db.insert(users).values(user);

  if (user.email) {
    sendWelcomeEmail({
      toEmail: user.email,
      userName: user.name || "there",
    }).catch(err => console.warn("[Email] Failed to send welcome email:", err));
  }

  return { isNew: true };
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPassword(
  userId: number,
  hashedPassword: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ passwordHash: hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserPlan(
  userId: number,
  plan: "free" | "pro" | "enterprise"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ plan, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users);
}
