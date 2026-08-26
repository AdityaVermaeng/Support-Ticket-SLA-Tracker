import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import prisma from "../config/prisma.js";
import { generateToken } from "../utils/jwt.js";

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export class AuthService {
  static async register(data: RegisterDTO) {
    const { name, email, password, role = UserRole.REPORTER } = data;

    if (!name || !name.trim()) {
      throw { statusCode: 400, message: "Name is required" };
    }
    if (!email || !email.trim()) {
      throw { statusCode: 400, message: "Email is required" };
    }
    if (!password || password.length < 6) {
      throw { statusCode: 400, message: "Password must be at least 6 characters" };
    }

    // SECURITY: Block ADMIN creation through public registration
    const safeRole = role === UserRole.ADMIN ? UserRole.REPORTER : role;

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw { statusCode: 409, message: "User with this email already exists" };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: safeRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  static async login(data: LoginDTO) {
    const { email, password } = data;

    if (!email || !password) {
      throw { statusCode: 400, message: "Email and password are required" };
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw { statusCode: 401, message: "Invalid email or password" };
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw { statusCode: 401, message: "Invalid email or password" };
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const userWithoutPassword = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return { user: userWithoutPassword, token };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw { statusCode: 404, message: "User not found" };
    }

    return user;
  }

  static async getUsers(role?: UserRole) {
    const where = role ? { role } : {};
    return prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }
}
