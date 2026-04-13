import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { creditsRouter } from "./creditsRouter";
import { queueRouter } from "./queueRouter";
import { historyRouter } from "./historyRouter";
import { adminRouter } from "./adminRouter";
import { apiKeysRouter } from "./apiKeysRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  credits: creditsRouter,
  queue: queueRouter,
  history: historyRouter,
  admin: adminRouter,
  apiKeys: apiKeysRouter,
});

export type AppRouter = typeof appRouter;
