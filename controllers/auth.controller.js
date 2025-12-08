// controllers/auth.controller.js
import crypto from "crypto";
import _ from "lodash";
import { AdminSchema, ResetPasswordSchema } from "../models/models_import.js";
import {
  comparePassword,
  generateToken,
  hashPassword,
  verificationToken,
} from "../helpers/shared.helper.js";
import {
  successResponse,
  errorResponse,
} from "../helpers/response.helper.js";
import {
  INVALID_ACCOUNT_DETAILS,
  INCORRECT_PASSWORD,
  LOGIN_SUCCESS,
  PASSWORD_CHANGED_SUCCESSFULLY,
  PASSWORD_CHANGED_FAILED,
} from "../helpers/message.helper.js";
import { sendMail } from "../helpers/mail.helper.js";

const CLIENT_URL = process.env.CLIENT_URL || "https://Mecatronix.com";
const cookieMaxAge = Number(process.env.COOKIE_EXPIRE) || 60 * 60 * 1000;

/* ======================================================
   🔹 LOGIN
   ====================================================== */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return errorResponse(res, "Email and password are required", 400);

    const user = await AdminSchema.findOne({ email });
    if (!user) return errorResponse(res, INVALID_ACCOUNT_DETAILS, 401);

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid)
      return errorResponse(res, INCORRECT_PASSWORD, 401);

    const payload = { id: user._id, email: user.email, role: user.role };
    const token = await generateToken(payload);

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: cookieMaxAge,
      path: "/",
    });

    const safeUser = _.omit(user.toObject(), ["password"]);
    return successResponse(res, LOGIN_SUCCESS, safeUser);
  } catch (err) {
    console.error("🚨 Login Error:", err);
    return errorResponse(res, "An error occurred while logging in", 500);
  }
};

/* ======================================================
   🔹 CHANGE PASSWORD
   ====================================================== */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.userData?.id;

    if (!userId) return errorResponse(res, "Unauthorized", 401);
    if (!oldPassword || !newPassword)
      return errorResponse(res, "Both old and new passwords are required", 400);

    const user = await AdminSchema.findById(userId);
    if (!user) return errorResponse(res, "User not found", 404);

    const isMatch = await comparePassword(oldPassword, user.password);
    if (!isMatch) return errorResponse(res, INCORRECT_PASSWORD, 400);

    user.password = await hashPassword(newPassword);
    await user.save();

    return successResponse(res, PASSWORD_CHANGED_SUCCESSFULLY);
  } catch (err) {
    console.error("🚨 Change Password Error:", err);
    return errorResponse(res, PASSWORD_CHANGED_FAILED, 500);
  }
};

/* ======================================================
   🔹 CHECK LOGIN STATUS
   ====================================================== */
export const checkLoginStatus = async (req, res) => {
  try {
    const token = req.cookies?.admin_token;
    if (!token) return errorResponse(res, "Unauthorized access", 401);

    const decoded = await verificationToken(token);
    if (!decoded?.id) return errorResponse(res, "Invalid token", 401);

    const user = await AdminSchema.findById(decoded.id).select("-password");
    if (!user) return errorResponse(res, "User not found", 404);

    return successResponse(res, "Already logged in", user);
  } catch (err) {
    console.error("🚨 Check Login Status Error:", err);
    return errorResponse(res, "Server error", 500);
  }
};

/* ======================================================
   🔹 FORGOT PASSWORD (Send Reset Link)
   ====================================================== */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return errorResponse(res, "Email is required");

    const user = await AdminSchema.findOne({ email });
    if (!user) return errorResponse(res, "Account not found");

    // 1️⃣ Generate raw + hashed token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 2️⃣ Expiration (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 3️⃣ Remove old tokens
    await ResetPasswordSchema.deleteMany({ user_id: user._id });

    // 4️⃣ Save new reset request
    await ResetPasswordSchema.create({
      user_id: user._id,
      reset_token: hashedToken,
      expiresAt,
    });

    // 5️⃣ Build link
    const resetLink = `${CLIENT_URL}/reset-password/${rawToken}`;

    // 6️⃣ Send email
    await sendMail({
      to: user.email,
      subject: "Reset Your Mecatronix Password",
      template: "passwordReset",
      data: { resetLink },
    });

    return successResponse(res, "Password reset email sent successfully");
  } catch (error) {
    console.error("🚨 Forgot Password Error:", error);
    return errorResponse(res, "Failed to send reset link", 500);
  }
};

/* ======================================================
   🔹 VERIFY RESET TOKEN
   ====================================================== */
export const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return errorResponse(res, "Token is required");

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const resetRecord = await ResetPasswordSchema.findOne({
      reset_token: hashedToken,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord)
      return errorResponse(res, "Invalid or expired reset link", 400);

    return successResponse(res, "Valid reset token");
  } catch (error) {
    console.error("🚨 Verify Reset Token Error:", error);
    return errorResponse(res, "Invalid or expired reset link", 500);
  }
};

/* ======================================================
   🔹 RESET PASSWORD
   ====================================================== */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword)
      return errorResponse(res, "Token and new password are required");

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const resetRecord = await ResetPasswordSchema.findOne({
      reset_token: hashedToken,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord)
      return errorResponse(res, "Invalid or expired reset token", 400);

    const user = await AdminSchema.findById(resetRecord.user_id);
    if (!user) return errorResponse(res, "User not found", 404);

    // ✅ Encrypt password
    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    await user.save();

    await ResetPasswordSchema.deleteMany({ user_id: user._id });

    // 6️⃣ Send email
    await sendMail({
      to: user.email,
      subject: "Password reset successful",
      template: "passwordSuccess",
    });

    return successResponse(res, "Password reset successful");
  } catch (error) {
    console.error("🚨 Reset Password Error:", error);
    return errorResponse(res, "Password reset failed", 500);
  }
};

/* ======================================================
   🔹 LOGOUT
   ====================================================== */
export const logout = async (req, res) => {
  try {
    res.clearCookie("admin_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      path: "/",
    });
    return successResponse(res, "Logged out successfully");
  } catch (err) {
    console.error("🚨 Logout Error:", err);
    return errorResponse(res, "Logout failed", 500);
  }
};
