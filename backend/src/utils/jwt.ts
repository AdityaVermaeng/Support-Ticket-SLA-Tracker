import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export interface TokenPayload {
  id: string;
  email: string;
  role: UserRole;
}

const JWT_SECRET = process.env.JWT_SECRET || "sla-tracker-secret-key-2026";

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
