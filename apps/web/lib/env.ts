import { z } from "zod";

type RawEnv = {
  NEXTAUTH_URL?: string;
  NEXTAUTH_SECRET?: string;
  SENDGRID_API_KEY?: string;
  EMAIL_FROM?: string;
  LOGO_URL?: string;
  AIRTABLE_PAT?: string;
  AIRTABLE_API_KEY?: string;
  AIRTABLE_BASE_ID?: string;
  AIRTABLE_CONTACTS_TABLE?: string;
  AIRTABLE_EMAIL_FIELD?: string;
  DATABASE_URL?: string;
  APP_URL?: string;
};

const rawEnv: RawEnv = {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM ?? "JBV Capital <noreply@jbv.com>",
  LOGO_URL: process.env.LOGO_URL,
  AIRTABLE_PAT: process.env.AIRTABLE_PAT,
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  AIRTABLE_CONTACTS_TABLE: process.env.AIRTABLE_CONTACTS_TABLE,
  AIRTABLE_EMAIL_FIELD: process.env.AIRTABLE_EMAIL_FIELD,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL ?? process.env.NEXTAUTH_URL,
};

const envSchema = z
  .object({
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(16),
    SENDGRID_API_KEY: z.string().min(10),
    EMAIL_FROM: z.string().min(3),
    LOGO_URL: z.string().url(),
    AIRTABLE_TOKEN: z.string().min(10),
    AIRTABLE_BASE_ID: z.string().min(5),
    AIRTABLE_CONTACTS_TABLE: z.string().min(1).default("Contacts"),
    AIRTABLE_EMAIL_FIELD: z.string().min(1).default("Email"),
    DATABASE_URL: z.string().min(10),
    APP_URL: z.string().url(),
  })
  .refine(
    (value) => Boolean(value.AIRTABLE_TOKEN),
    "AIRTABLE_PAT or AIRTABLE_API_KEY must be provided"
  );

const parsed = envSchema.safeParse({
  NEXTAUTH_URL: rawEnv.NEXTAUTH_URL,
  NEXTAUTH_SECRET: rawEnv.NEXTAUTH_SECRET,
  SENDGRID_API_KEY: rawEnv.SENDGRID_API_KEY,
  EMAIL_FROM: rawEnv.EMAIL_FROM,
  LOGO_URL: rawEnv.LOGO_URL,
  AIRTABLE_TOKEN: rawEnv.AIRTABLE_PAT ?? rawEnv.AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID: rawEnv.AIRTABLE_BASE_ID,
  AIRTABLE_CONTACTS_TABLE: rawEnv.AIRTABLE_CONTACTS_TABLE,
  AIRTABLE_EMAIL_FIELD: rawEnv.AIRTABLE_EMAIL_FIELD,
  DATABASE_URL: rawEnv.DATABASE_URL,
  APP_URL: rawEnv.APP_URL,
});

if (!parsed.success) {
  console.error("[config] Missing or invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = {
  NEXTAUTH_URL: parsed.data.NEXTAUTH_URL,
  NEXTAUTH_SECRET: parsed.data.NEXTAUTH_SECRET,
  SENDGRID_API_KEY: parsed.data.SENDGRID_API_KEY,
  EMAIL_FROM: parsed.data.EMAIL_FROM,
  LOGO_URL: parsed.data.LOGO_URL,
  AIRTABLE_TOKEN: parsed.data.AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID: parsed.data.AIRTABLE_BASE_ID,
  AIRTABLE_CONTACTS_TABLE: parsed.data.AIRTABLE_CONTACTS_TABLE,
  AIRTABLE_EMAIL_FIELD: parsed.data.AIRTABLE_EMAIL_FIELD,
  DATABASE_URL: parsed.data.DATABASE_URL,
  APP_URL: parsed.data.APP_URL,
} as const;

if (!process.env.AIRTABLE_API_KEY) {
  process.env.AIRTABLE_API_KEY = env.AIRTABLE_TOKEN;
}

if (!process.env.AIRTABLE_PAT) {
  process.env.AIRTABLE_PAT = env.AIRTABLE_TOKEN;
}

if (!process.env.EMAIL_FROM) {
  process.env.EMAIL_FROM = env.EMAIL_FROM;
}

export type Env = typeof env;
