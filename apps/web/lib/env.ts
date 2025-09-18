import { z } from "zod";

const envSchema = z
  .object({
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(16),
    SENDGRID_API_KEY: z.string().min(10),
    EMAIL_FROM: z.string().min(3),
    LOGO_URL: z.string().url(),
    AIRTABLE_PAT: z.string().min(10).optional(),
    AIRTABLE_API_KEY: z.string().min(10).optional(),
    AIRTABLE_BASE_ID: z.string().min(5),
    AIRTABLE_CONTACTS_TABLE: z.string().min(1).default("Contacts"),
    AIRTABLE_EMAIL_FIELD: z.string().min(1).default("Email"),
    DATABASE_URL: z.string().min(10),
    APP_URL: z.string().url(),
  })
  .superRefine((value, ctx) => {
    if (!value.AIRTABLE_PAT && !value.AIRTABLE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AIRTABLE_PAT"],
        message: "Set AIRTABLE_PAT or AIRTABLE_API_KEY to access Airtable.",
      });
    }
  });

const parsed = envSchema.parse({
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  LOGO_URL: process.env.LOGO_URL,
  AIRTABLE_PAT: process.env.AIRTABLE_PAT,
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  AIRTABLE_CONTACTS_TABLE: process.env.AIRTABLE_CONTACTS_TABLE,
  AIRTABLE_EMAIL_FIELD: process.env.AIRTABLE_EMAIL_FIELD,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL,
});

export const env = {
  ...parsed,
  AIRTABLE_TOKEN: parsed.AIRTABLE_PAT ?? parsed.AIRTABLE_API_KEY!,
};
