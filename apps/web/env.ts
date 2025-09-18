import { z } from "zod";

const envSchema = z.object({
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  SENDGRID_API_KEY: z.string().min(10),
  EMAIL_FROM: z.string().min(3),
  LOGO_URL: z.string().url(),
  AIRTABLE_PAT: z.string().min(10),
  AIRTABLE_BASE_ID: z.string().min(5),
  AIRTABLE_CONTACTS_TABLE: z.string().min(1).default("Contacts"),
  AIRTABLE_EMAIL_FIELD: z.string().min(1).default("Email"),
  DATABASE_URL: z.string().min(10),
  APP_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[env] Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

if (!process.env.AIRTABLE_API_KEY) {
  process.env.AIRTABLE_API_KEY = env.AIRTABLE_PAT;
}

export type AppEnv = typeof env;
