import { UserRole, Permission } from "@cafm/shared-schema";
import { DecodedIdToken } from "firebase-admin/auth";
export interface RBACContext {
    auth: any;
    firestore: any;
    logger: any;
}
export interface UserRoleClaimsRequest {
    uid: string;
    role: UserRole;
    userId: string;
    timestamp: Date;
}
export interface AuthorizationCheckRequest {
    decodedToken: DecodedIdToken;
    requiredPermission: Permission;
}
export declare function setUserRoleClaims(request: UserRoleClaimsRequest, context: RBACContext): Promise<{
    success: boolean;
    message: string;
}>;
export declare function verifyPermission(request: AuthorizationCheckRequest, context: RBACContext): Promise<{
    allowed: boolean;
    message: string;
    role?: UserRole;
}>;
export declare function syncRolePermissions(uid: string, context: RBACContext): Promise<{
    success: boolean;
    role?: UserRole;
    permissions?: Permission[];
}>;
export declare function requirePermission(requiredPermission: Permission): (req: any, res: any, next: any) => Promise<any>;
//# sourceMappingURL=rbac-claims.d.ts.map