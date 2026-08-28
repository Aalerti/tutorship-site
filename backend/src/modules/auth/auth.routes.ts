import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { loginSchema } from "./auth.schemas.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", {
    config: {
      rateLimit: {
        max: 8,
        timeWindow: "1 minute"
      }
    }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ message: "Неверная почта или пароль" });
    }

    const isValid = await argon2.verify(user.passwordHash, input.password);
    if (!isValid) {
      return reply.code(401).send({ message: "Неверная почта или пароль" });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    const accessToken = app.jwt.sign(payload, { expiresIn: env.ACCESS_TOKEN_TTL });
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.REFRESH_TOKEN_TTL_SECONDS
    });

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: env.REFRESH_TOKEN_TTL_SECONDS
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  });

  app.post("/refresh", async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.code(401).send({ message: "Нет refresh token" });
    }

    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { id: string; email: string; role: "ADMIN" | "TUTOR" };

    const user = await app.prisma.user.findUnique({
      where: { id: payload.id }
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ message: "Пользователь отключён" });
    }

    return {
      accessToken: app.jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role
      }, { expiresIn: env.ACCESS_TOKEN_TTL })
    };
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("refreshToken", { path: "/api/auth" });
    return { ok: true };
  });

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    const authUser = request.user;
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    return { user };
  });
}
