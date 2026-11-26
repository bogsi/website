export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** e.g. https://roussev.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access application */
  ACCESS_AUD: string;
  /** Local development only; ignored unless the host is localhost */
  ACCESS_DEV_EMAIL?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userEmail: string; sessionExpiresAt: number | null };
};
