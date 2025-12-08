// controllers/admin.controller.js
import { AdminSchema } from "../models/admin.model.js";
import { hashPassword } from "../helpers/shared.helper.js";
import {
  errorResponse,
  successResponse,
} from "../helpers/response.helper.js";
import {
  ADMIN_ADDED_SUCCESS,
  ADMIN_ADDED_FAILED,
  ADMIN_GETTED_SUCCESS,
  ADMIN_GETTED_FAILED,
  ADMIN_UPDATED_SUCCESS,
  ADMIN_UPDATED_FAILED,
  ADMIN_DELETED_SUCCESS,
  ADMIN_DELETED_FAILED,
  ADMIN_ACCOUNT_ALREADY_EXISTS,
} from "../helpers/message.helper.js";
import { sendMail } from "../helpers/mail.helper.js";

/* ======================================================
   🔹 ADD NEW ADMIN
   ====================================================== */
export const addAdmin = async (req, res) => {
  try {
    const { email, img, password, name, role, phone } = req.body;

    // ✅ Validate required fields
    if (!email?.trim() || !password?.trim() || !name?.trim()) {
      return errorResponse(res, "Email, name, and password are required.", 400);
    }

    // ✅ Check for existing account
    const existingAdmin = await AdminSchema.findOne({ email });
    if (existingAdmin) {
      return errorResponse(res, ADMIN_ACCOUNT_ALREADY_EXISTS, 409);
    }

    // ✅ Send credentials to new admin via email
    await sendMail({
      to: email,
      subject: "🎉 Your Admin Account Has Been Created",
      template: "newAdmin", // 👇 custom email template
      data: {
        name,
        email,
        phone,
        password, // 👈 plain password only for the first-time login email
        role: role || "admin",
        loginUrl: `${process.env.CLIENT_URL || "https://Admin.mecatronix.com"}/login`,
      },
    });

    // ✅ Encrypt password
    const hashedPassword = await hashPassword(password);

    // ✅ Create and save new admin
    const newAdmin = new AdminSchema({
      email,
      img,
      password: hashedPassword,
      name: name.trim(),
      role: role || "admin",
      phone: phone || null,
    });

    const savedAdmin = await newAdmin.save();

    // ✅ Remove password before sending response
    const result = savedAdmin.toObject();
    delete result.password;

    return successResponse(res, ADMIN_ADDED_SUCCESS, result);
  } catch (error) {
    console.error("🚨 addAdmin Error:", error);
    return errorResponse(res, ADMIN_ADDED_FAILED, 500);
  }
};

/* ======================================================
   🔹 GET ADMIN BY ID
   ====================================================== */
export const getAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return errorResponse(res, "Admin ID is required.", 400);

    const admin = await AdminSchema.findById(id).select("-password");

    if (!admin) return errorResponse(res, "Admin not found.", 404);

    return successResponse(res, ADMIN_GETTED_SUCCESS, admin);
  } catch (error) {
    console.error("🚨 getAdmin Error:", error);
    return errorResponse(res, ADMIN_GETTED_FAILED, 500);
  }
};

export const getAllAdmin = async (req, res) => {
  try {
    // Find all admins where role is not "superadmin"
    const admins = await AdminSchema.find({ role: { $ne: "superadmin" } })
      .select("-password");

    if (!admins || admins.length === 0) {
      return errorResponse(res, "No admins found.", 404);
    }

    return successResponse(res, "Admins retrieved successfully.", admins);
  } catch (error) {
    console.error("🚨 getAllAdmin Error:", error);
    return errorResponse(res, "Failed to get admins.", 500);
  }
};


/* ======================================================
   🔹 UPDATE ADMIN DETAILS
   ====================================================== */
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // ✅ Validate ID
    if (!id) return errorResponse(res, "Admin ID is required.", 400);

    // ✅ Fetch the current admin data
    const admin = await AdminSchema.findById(id);
    if (!admin) return errorResponse(res, "Admin not found.", 404);

    let newPasswordPlain = null;

    // ✅ Securely hash password if it's being updated
    if (updateData.password?.trim()) {
      newPasswordPlain = updateData.password; // Save plain password for email
      updateData.password = await hashPassword(updateData.password);
    }

    // ✅ Update admin in DB
    const updatedAdmin = await AdminSchema.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    // ✅ Send password update email only if password was changed
    if (newPasswordPlain) {
      try {
        await sendMail({
          to: updatedAdmin.email,
          subject: "🔐 Your Admin Password Has Been Updated",
          template: "passwordUpdated", // custom email template
          data: {
            name: updatedAdmin.name,
            email: updatedAdmin.email,
            password: newPasswordPlain,
            loginUrl: `${process.env.CLIENT_URL || "https://Admin.mecatronix.com"}/login`,
          },
        });
      } catch (mailError) {
        console.error("⚠️ Password update email failed:", mailError.message);
      }
    }

    return successResponse(res, ADMIN_UPDATED_SUCCESS, updatedAdmin);
  } catch (error) {
    console.error("🚨 updateAdmin Error:", error);
    return errorResponse(res, ADMIN_UPDATED_FAILED, 500);
  }
};

/* ======================================================
   🔹 DELETE ADMIN
   ====================================================== */
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return errorResponse(res, "Admin ID is required.", 400);

    // ✅ Find the admin first (we need their email & name before deleting)
    const admin = await AdminSchema.findById(id);
    if (!admin) {
      return errorResponse(res, "Admin not found.", 404);
    }

    // ✅ Delete admin
    await AdminSchema.findByIdAndDelete(id);

    // 📩 Send deletion notification email
    await sendMail({
      to: admin.email,
      subject: "🗑️ Admin Account Deleted - Mecatronix",
      template: "adminDeleted",
      data: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
        supportEmail: process.env.MAIL_USER,
        contactUrl: `${process.env.CLIENT_URL}/contact`,
      },
    });

    return successResponse(res, ADMIN_DELETED_SUCCESS);
  } catch (error) {
    console.error("🚨 deleteAdmin Error:", error);
    return errorResponse(res, ADMIN_DELETED_FAILED, 500);
  }
};
