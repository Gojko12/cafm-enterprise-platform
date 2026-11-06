import { ROLE_PERMISSIONS, hasPermission, } from "@cafm/shared-schema";
export async function setUserRoleClaims(request, context) {
    const { auth, firestore, logger } = context;
    const { uid, role, userId, timestamp } = request;
    try {
        const customClaims = {
            role,
            permissions: Array.from(ROLE_PERMISSIONS[role]),
            claimsSetAt: timestamp.toISOString(),
        };
        await auth.setCustomUserClaims(uid, customClaims);
        await firestore
            .collection("user_role_assignments")
            .doc(uid)
            .set({
            uid,
            role,
            permissions: Array.from(ROLE_PERMISSIONS[role]),
            AssignedBy: userId,
            AssignedAt: timestamp.toISOString(),
            UpdatedAt: timestamp.toISOString(),
        }, { merge: true });
        await firestore
            .collection("rbac_audit_log")
            .add({
            uid,
            Action: "role_assigned",
            Role: role,
            Permissions: ROLE_PERMISSIONS[role],
            ActorId: userId,
            OccurredAt: timestamp.toISOString(),
        });
        logger.info("Set user role claims", { uid, role });
        return {
            success: true,
            message: `User ${uid} assigned role ${role} with ${ROLE_PERMISSIONS[role].length} permissions.`,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to set user role claims", { uid, role, error: errorMessage });
        return {
            success: false,
            message: `Failed to assign role: ${errorMessage}`,
        };
    }
}
export async function verifyPermission(request, context) {
    const { logger } = context;
    const { decodedToken, requiredPermission } = request;
    try {
        const role = decodedToken.role;
        if (!role) {
            logger.warn("User has no assigned role", { uid: decodedToken.uid });
            return {
                allowed: false,
                message: "User has no assigned role.",
            };
        }
        if (!Object.keys(ROLE_PERMISSIONS).includes(role)) {
            logger.error("Invalid role assigned to user", { uid: decodedToken.uid, role });
            return {
                allowed: false,
                message: `Invalid role: ${role}`,
            };
        }
        const allowed = hasPermission(role, requiredPermission);
        if (!allowed) {
            logger.warn("Permission denied", {
                uid: decodedToken.uid,
                role,
                requiredPermission,
            });
        }
        return {
            allowed,
            message: allowed
                ? `User has permission: ${requiredPermission}`
                : `User denied permission: ${requiredPermission}`,
            role,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to verify permission", {
            uid: decodedToken.uid,
            error: errorMessage,
        });
        return {
            allowed: false,
            message: `Authorization check failed: ${errorMessage}`,
        };
    }
}
export async function syncRolePermissions(uid, context) {
    const { firestore, logger } = context;
    try {
        const roleDoc = await firestore.collection("user_role_assignments").doc(uid).get();
        if (!roleDoc.exists) {
            logger.warn("No role assignment found for user", { uid });
            return { success: false };
        }
        const role = roleDoc.data().role;
        const permissions = Array.from(ROLE_PERMISSIONS[role] || []);
        logger.info("Synced role permissions", { uid, role });
        return {
            success: true,
            role,
            permissions,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to sync role permissions", { uid, error: errorMessage });
        return { success: false };
    }
}
export function requirePermission(requiredPermission) {
    return async (req, res, next) => {
        try {
            const decodedToken = req.user;
            if (!decodedToken) {
                return res.status(401).json({ error: "Authentication required" });
            }
            const role = decodedToken.role;
            if (!role) {
                return res.status(403).json({
                    error: "User has no assigned role",
                });
            }
            const allowed = hasPermission(role, requiredPermission);
            if (!allowed) {
                return res.status(403).json({
                    error: `Permission denied: ${requiredPermission}`,
                });
            }
            next();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return res.status(500).json({ error: errorMessage });
        }
    };
}
//# sourceMappingURL=rbac-claims.js.map